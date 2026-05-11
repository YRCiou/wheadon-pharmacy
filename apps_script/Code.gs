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

const SHEET_ID = "19LmH7o8m45BaROIJGXCfdriqv6wvzoBqAtJw6a1LHo0";
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
// 多管理員支援
// 把舊版的 AUTH_USERNAME / AUTH_PASSWORD_HASH 自動遷移成 AUTH_USERS
// ============================================================
function getUsers_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty("AUTH_USERS");
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { return []; }
  }
  // 遷移：舊版單一使用者
  const u = props.getProperty("AUTH_USERNAME");
  const h = props.getProperty("AUTH_PASSWORD_HASH");
  if (u && h) {
    const users = [{ u: u, h: h }];
    props.setProperty("AUTH_USERS", JSON.stringify(users));
    return users;
  }
  return [];
}

function setUsers_(users) {
  PropertiesService.getScriptProperties().setProperty("AUTH_USERS", JSON.stringify(users));
}

function findUser_(username) {
  return getUsers_().find(u => u.u === username) || null;
}

function getTokenUsername_(token) {
  if (!token) return null;
  try {
    const ep = token.split(".")[0];
    const data = JSON.parse(ub64u_(ep));
    return data.u;
  } catch (e) { return null; }
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
    if (action === "importFromIg")   return json_(handleImportFromIg_(body));
    if (action === "republish")      return json_(handleRepublish_(body));
    if (action === "changePassword") return json_(handleChangePassword_(body));
    if (action === "renameSelf")     return json_(handleRenameSelf_(body));
    if (action === "listUsers")      return json_(handleListUsers_(body));
    if (action === "addUser")        return json_(handleAddUser_(body));
    if (action === "removeUser")     return json_(handleRemoveUser_(body));

    return json_({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return json_({ ok: false, error: String(err), stack: (err.stack || '').toString().substring(0, 800) });
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
  const user = findUser_(String(body.username || ""));
  if (!user) return { ok: false, error: "帳號或密碼錯誤" };
  if (sha256_(body.password || "") !== user.h) return { ok: false, error: "帳號或密碼錯誤" };
  return { ok: true, token: signToken_(user.u), username: user.u };
}

function handleChangePassword_(body) {
  const newPwd = String(body.newPassword || "");
  if (newPwd.length < 8) return { ok: false, error: "密碼至少 8 字元" };
  const myUsername = getTokenUsername_(body.token);
  if (!myUsername) return { ok: false, error: "尚未登入" };
  const users = getUsers_();
  const idx = users.findIndex(u => u.u === myUsername);
  if (idx < 0) return { ok: false, error: "找不到使用者" };
  users[idx].h = sha256_(newPwd);
  setUsers_(users);
  return { ok: true };
}

function handleRenameSelf_(body) {
  const newUsername = String(body.newUsername || "").trim();
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(newUsername)) {
    return { ok: false, error: "帳號需 3~30 字元，限英數、底線、連字號" };
  }
  const myUsername = getTokenUsername_(body.token);
  if (!myUsername) return { ok: false, error: "尚未登入" };
  if (newUsername === myUsername) return { ok: true, username: newUsername, token: body.token };
  const users = getUsers_();
  if (users.find(u => u.u === newUsername)) return { ok: false, error: "帳號已存在" };
  const idx = users.findIndex(u => u.u === myUsername);
  if (idx < 0) return { ok: false, error: "找不到使用者" };
  users[idx].u = newUsername;
  setUsers_(users);
  // 重新發 token
  return { ok: true, username: newUsername, token: signToken_(newUsername) };
}

function handleListUsers_(body) {
  const me = getTokenUsername_(body.token);
  return { ok: true, me: me, users: getUsers_().map(u => u.u) };
}

function handleAddUser_(body) {
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
    return { ok: false, error: "帳號需 3~30 字元，限英數、底線、連字號" };
  }
  if (password.length < 8) return { ok: false, error: "密碼至少 8 字元" };
  const users = getUsers_();
  if (users.find(u => u.u === username)) return { ok: false, error: "帳號已存在" };
  users.push({ u: username, h: sha256_(password) });
  setUsers_(users);
  return { ok: true };
}

function handleRemoveUser_(body) {
  const target = String(body.username || "");
  const me = getTokenUsername_(body.token);
  if (!me) return { ok: false, error: "尚未登入" };
  if (target === me) return { ok: false, error: "不能刪除自己 (請先登出讓別的管理員操作)" };
  let users = getUsers_();
  if (users.length <= 1) return { ok: false, error: "至少要保留一位管理員" };
  users = users.filter(u => u.u !== target);
  setUsers_(users);
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
    headers.forEach((h, j) => {
      let v = range[i][j];
      if (v instanceof Date) v = v.toISOString();
      else if (v && typeof v === 'object') v = String(v);  // 防止其他特殊物件
      obj[h] = v;
    });
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
// 從 IG 連結匯入：抓 og:image + og:description → 上傳 GitHub → 寫試算表
// ============================================================
function handleImportFromIg_(body) {
  const url = String(body.url || "").trim();
  const m = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
  if (!m) return { ok: false, error: "請貼有效的 IG 貼文網址，例如 https://www.instagram.com/p/Dxxxxxx/" };
  const shortcode = m[1];
  const productId = "ig-" + shortcode;

  // 先查試算表是否已匯入過
  const sheet = getSheet_();
  const headers = getHeaders_(sheet);
  const idCol = headers.indexOf("id");
  if (idCol < 0) return { ok: false, error: "試算表沒有 id 欄位" };
  const ids = sheet.getRange(2, idCol + 1, Math.max(sheet.getLastRow() - 1, 1), 1)
    .getValues().map(r => String(r[0]));
  if (ids.indexOf(productId) >= 0) {
    return { ok: false, error: "這篇 IG 貼文已經匯入過了 (id: " + productId + ")" };
  }
  // 也檢查純 shortcode（IG 同步舊資料的格式）以及純 post_id（gallery-dl 的格式）
  if (ids.indexOf(shortcode) >= 0) {
    return { ok: false, error: "這篇 IG 貼文已存在 (shortcode: " + shortcode + ")" };
  }

  // 抓 IG 公開頁面
  const igResp = UrlFetchApp.fetch("https://www.instagram.com/p/" + shortcode + "/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    },
    muteHttpExceptions: true,
    followRedirects: true,
  });
  const igCode = igResp.getResponseCode();
  if (igCode !== 200) {
    return { ok: false, error: "無法讀取 IG 貼文 (status " + igCode + ")，貼文可能不公開或 IG 暫時擋請求" };
  }
  const html = igResp.getContentText();

  // 抓 og:image 和 og:description
  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!ogImageMatch) return { ok: false, error: "找不到圖片連結 (IG 可能改版了)" };
  const ogImageUrl = ogImageMatch[1].replace(/&amp;/g, "&");

  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  let caption = "";
  if (ogDescMatch) {
    caption = ogDescMatch[1]
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    // og:description 通常是  '@account on Instagram: "actual caption"'
    const innerMatch = caption.match(/:\s*"(.+)"/s);
    if (innerMatch) caption = innerMatch[1];
  }
  // 第一行（短一點）當商品名稱
  let title = caption.split(/\r?\n/).find(l => l.trim()) || "";
  title = title.trim();
  if (title.length > 60) title = title.substring(0, 60) + "…";

  // 抓圖
  const imgResp = UrlFetchApp.fetch(ogImageUrl, { muteHttpExceptions: true, followRedirects: true });
  if (imgResp.getResponseCode() !== 200) {
    return { ok: false, error: "圖片下載失敗 (status " + imgResp.getResponseCode() + ")" };
  }
  const imgBytes = imgResp.getContent();
  const contentBase64 = Utilities.base64Encode(imgBytes);

  // 上傳 GitHub
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("GITHUB_TOKEN");
  if (!token) return { ok: false, error: "尚未設定 GITHUB_TOKEN" };
  const stamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyyMMdd-HHmmss");
  const filename = "ig-" + shortcode + ".jpg";
  const path = IMAGE_DIR + "/" + stamp + "-" + filename;
  const ghUrl = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + path;
  const ghResp = UrlFetchApp.fetch(ghUrl, {
    method: "put",
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    contentType: "application/json",
    payload: JSON.stringify({
      message: "從 IG 匯入：" + shortcode,
      content: contentBase64,
    }),
    muteHttpExceptions: true,
  });
  if (ghResp.getResponseCode() !== 201 && ghResp.getResponseCode() !== 200) {
    return { ok: false, error: "GitHub 上傳失敗: " + ghResp.getContentText().substring(0, 200) };
  }

  // 寫試算表
  const fields = {
    id: productId,
    shortcode: shortcode,
    "商品名稱": title,
    "image": "images/" + stamp + "-" + filename,
    "_caption_預覽": caption.substring(0, 500),
  };
  const row = headers.map(h => fields[h] !== undefined ? fields[h] : "");
  sheet.appendRow(row);
  return {
    ok: true,
    id: productId,
    shortcode: shortcode,
    title: title,
    image: fields.image,
    captionPreview: caption.substring(0, 100),
  };
}

// ============================================================
// 重新發布：觸發 GitHub Actions workflow
// ============================================================
function handleRepublish_(body) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("GITHUB_TOKEN");
  if (!token) return { ok: false, error: "尚未設定 GITHUB_TOKEN" };

  const url = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME
    + "/actions/workflows/republish.yml/dispatches";
  const resp = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    contentType: "application/json",
    payload: JSON.stringify({ ref: "main" }),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code === 204) {
    return { ok: true, msg: "已觸發發布，約 1～2 分鐘後上線" };
  }
  if (code === 403 || code === 404) {
    return { ok: false, error: "GitHub token 缺 Actions 權限。請到 GitHub 編輯 wheadon-admin token，加上 Repository permissions → Actions → Read and write" };
  }
  return { ok: false, error: "GitHub Actions API " + code + ": " + resp.getContentText().substring(0, 200) };
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
