/* ============================================================
 * 惠登藥局後台 (Apps Script Web App)
 * ============================================================
 * 部署步驟：
 *   1. 建立新的 Google Apps Script 專案 (https://script.google.com)
 *   2. 把這份檔案整個內容貼到 Code.gs
 *   3. 把下面 SHEET_ID 改成你實際的試算表 ID
 *      (試算表網址中  /d/  和  /edit  之間那串)
 *   4. 在「專案設定 → 指令碼屬性」加入這 3 個屬性：
 *        AUTH_USERNAME       值：ruth0105
 *        AUTH_PASSWORD_HASH  值：(用 setupHashPassword 函式產生)
 *        GITHUB_TOKEN        值：(新申請的 GitHub PAT)
 *   5. 部署 → 新增部署 → 類型「網頁應用程式」
 *      - 執行身分：自己
 *      - 存取：所有人 (包含匿名)
 *      取得網址後告訴我
 * ============================================================ */

const SHEET_ID = "REPLACE_WITH_YOUR_SHEET_ID";
const SHEET_NAME = "";   // 留空表示用第一個分頁
const REPO_OWNER = "YRCiou";
const REPO_NAME  = "wheadon-pharmacy";
const IMAGE_DIR  = "site/images";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;     // token 24 小時失效

// ============================================================
// 一次性設定工具：在 Apps Script 編輯器點選此函式 → 按「執行」
// 第一次跑會跳出授權，按「允許」即可
// 跑完到「執行紀錄」貼出 hash，再到指令碼屬性貼上
// 然後**把這個函式內的 myPassword 清空再存檔**
// ============================================================
function setupHashPassword() {
  const myPassword = "";   // ← 把你的密碼填這裡，跑完再清空
  if (!myPassword) throw new Error("請先把 myPassword 填上你的密碼");
  const h = sha256_(myPassword);
  Logger.log("AUTH_PASSWORD_HASH = " + h);
  Logger.log("⚠️  請立刻把 myPassword 那行清空再儲存檔案！");
}

// ============================================================
// HTTP 入口 (前端用 POST 呼叫，body 為 JSON)
// 用 text/plain 避開瀏覽器的 CORS preflight
// ============================================================
function doGet(e) {
  return ContentService
    .createTextOutput("OK - wheadon admin backend")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || "{}"); }
  catch (err) { return json_({ ok: false, error: "Invalid JSON" }); }

  const action = body.action;
  try {
    // 公開 actions
    if (action === "ping")      return json_({ ok: true, time: Date.now() });
    if (action === "login")     return json_(handleLogin_(body));

    // 需要 token 的 actions
    if (!verifyToken_(body.token)) {
      return json_({ ok: false, error: "尚未登入或登入逾時" });
    }
    if (action === "list")           return json_(handleList_());
    if (action === "update")         return json_(handleUpdate_(body));
    if (action === "add")            return json_(handleAdd_(body));
    if (action === "uploadImage")    return json_(handleUploadImage_(body));
    if (action === "changePassword") return json_(handleChangePassword_(body));

    return json_({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 認證
// ============================================================
function handleLogin_(body) {
  const props = PropertiesService.getScriptProperties();
  const u = props.getProperty("AUTH_USERNAME");
  const h = props.getProperty("AUTH_PASSWORD_HASH");
  if (!u || !h) return { ok: false, error: "後台尚未設定帳密 (檢查指令碼屬性)" };
  if (body.username !== u) return { ok: false, error: "帳號或密碼錯誤" };
  if (sha256_(body.password || "") !== h) return { ok: false, error: "帳號或密碼錯誤" };
  return { ok: true, token: signToken_(u), username: u };
}

function handleChangePassword_(body) {
  const newPwd = String(body.newPassword || "");
  if (newPwd.length < 8) return { ok: false, error: "密碼至少 8 字元" };
  PropertiesService.getScriptProperties().setProperty("AUTH_PASSWORD_HASH", sha256_(newPwd));
  return { ok: true };
}

function signToken_(username) {
  const payload = JSON.stringify({ u: username, exp: Date.now() + TOKEN_TTL_MS });
  const sig = hmacSha256_(payload, getSecret_());
  return b64u_(payload) + "." + b64u_(sig);
}

function verifyToken_(token) {
  if (!token || typeof token !== "string") return false;
  const [ep, es] = token.split(".");
  if (!ep || !es) return false;
  let payload;
  try { payload = ub64u_(ep); } catch (e) { return false; }
  let data;
  try { data = JSON.parse(payload); } catch (e) { return false; }
  if (!data || typeof data.exp !== "number") return false;
  if (Date.now() > data.exp) return false;
  const expected = hmacSha256_(payload, getSecret_());
  const got = ub64uBytes_(es);
  if (expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ got[i];
  return diff === 0;
}

function getSecret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty("SESSION_SECRET");
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("SESSION_SECRET", s);
  }
  return s;
}

// ============================================================
// 商品讀寫 (透過試算表)
// ============================================================
function getSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  if (SHEET_NAME) {
    const sh = ss.getSheetByName(SHEET_NAME);
    if (sh) return sh;
  }
  return ss.getSheets()[0];
}

function getHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0].map(h => String(h).trim());
}

function handleList_() {
  const sheet = getSheet_();
  const range = sheet.getDataRange().getValues();
  if (range.length === 0) return { ok: true, headers: [], rows: [] };
  const headers = range[0].map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < range.length; i++) {
    const obj = { _row: i + 1 };
    headers.forEach((h, j) => { obj[h] = range[i][j]; });
    if (obj.id !== "" && obj.id !== null && obj.id !== undefined) rows.push(obj);
  }
  return { ok: true, headers, rows };
}

function handleUpdate_(body) {
  const { row, field, value } = body;
  if (!row || row < 2) return { ok: false, error: "Invalid row" };
  const sheet = getSheet_();
  const headers = getHeaders_(sheet);
  const col = headers.indexOf(field);
  if (col < 0) return { ok: false, error: "Unknown field: " + field };
  sheet.getRange(row, col + 1).setValue(value);
  return { ok: true };
}

function handleAdd_(body) {
  const fields = body.fields || {};
  if (!fields.id) return { ok: false, error: "缺少 id" };
  const sheet = getSheet_();
  const headers = getHeaders_(sheet);
  // 不重複新增
  const ids = sheet.getRange(2, headers.indexOf("id") + 1, sheet.getLastRow(), 1)
    .getValues().map(r => String(r[0]));
  if (ids.indexOf(String(fields.id)) >= 0) {
    return { ok: false, error: "id 已存在: " + fields.id };
  }
  const row = headers.map(h => fields[h] !== undefined ? fields[h] : "");
  sheet.appendRow(row);
  return { ok: true, row: sheet.getLastRow() };
}

// ============================================================
// 圖片上傳到 GitHub
// ============================================================
function handleUploadImage_(body) {
  const filename = String(body.filename || "image.jpg");
  const contentBase64 = String(body.contentBase64 || "");
  if (!contentBase64) return { ok: false, error: "缺少圖片資料" };

  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("GITHUB_TOKEN");
  if (!token) return { ok: false, error: "尚未設定 GITHUB_TOKEN" };

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyyMMdd-HHmmss");
  const path = IMAGE_DIR + "/" + stamp + "-" + safeName;

  const url = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + path;
  const resp = UrlFetchApp.fetch(url, {
    method: "put",
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    contentType: "application/json",
    payload: JSON.stringify({
      message: "後台上傳：" + safeName,
      content: contentBase64,
    }),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code !== 201 && code !== 200) {
    return { ok: false, error: "GitHub API " + code + ": " + resp.getContentText().substring(0, 300) };
  }
  // 網站讀的是相對路徑（相對於 site/）：images/xxx.jpg
  return { ok: true, image: "images/" + stamp + "-" + safeName };
}

// ============================================================
// 工具函式
// ============================================================
function sha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(b => ((b < 0 ? b + 256 : b)).toString(16).padStart(2, "0")).join("");
}

function hmacSha256_(text, key) {
  return Utilities.computeHmacSha256Signature(text, key);
}

function b64u_(s) {
  // s 可以是字串或 byte array
  const enc = typeof s === "string" ? Utilities.base64EncodeWebSafe(s) : Utilities.base64EncodeWebSafe(s);
  return enc.replace(/=+$/, "");
}

function ub64u_(s) {
  // 補 padding 後解 base64 → 字串
  const padded = s + "===".slice((s.length + 3) % 4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString();
}

function ub64uBytes_(s) {
  const padded = s + "===".slice((s.length + 3) % 4);
  return Utilities.base64DecodeWebSafe(padded);
}
