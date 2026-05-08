/* ====================================================================
 *  惠登藥局後台 (/ruthie)
 *  Frontend logic — 登入、列表、編輯、新增、上傳圖、改密碼
 * ==================================================================== */

(() => {
  "use strict";

  // 後端 API 網址（Apps Script web app /exec）
  const API = "https://script.google.com/macros/s/AKfycby7PjtsKqKcKSg13LZ9gBN8L7QlrSxZYOB6RU7zMDS--DDEDr0OpCWRNJM6NcUF9kys/exec";
  const TOKEN_KEY = "ruthie.token";
  const USER_KEY = "ruthie.user";

  const $ = (s) => document.querySelector(s);

  // -------------------------------------------------- API
  async function api(action, data = {}) {
    const body = JSON.stringify({ action, token: getToken(), ...data });
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok) {
      // token 過期 → 登出
      if (json.error && /未登入|登入逾時/.test(json.error)) {
        clearToken();
        showLogin();
      }
      throw new Error(json.error || "Unknown error");
    }
    return json;
  }

  const getToken = () => sessionStorage.getItem(TOKEN_KEY);
  const setToken = (t, u) => {
    sessionStorage.setItem(TOKEN_KEY, t);
    if (u) sessionStorage.setItem(USER_KEY, u);
  };
  const clearToken = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  };

  // -------------------------------------------------- toast
  let toastTimer;
  function toast(msg, isError = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("is-error", isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  // -------------------------------------------------- view switching
  function showLogin() {
    $("#view-login").hidden = false;
    $("#view-manage").hidden = true;
    $("#loginUser").focus();
  }
  function showManage() {
    $("#view-login").hidden = true;
    $("#view-manage").hidden = false;
    loadList();
  }

  // -------------------------------------------------- login
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = $("#loginUser").value.trim();
    const p = $("#loginPwd").value;
    const err = $("#loginErr");
    err.hidden = true;
    $("#loginBtn").disabled = true;
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ action: "login", username: u, password: p }),
      }).then(r => r.json());
      if (!r.ok) throw new Error(r.error || "登入失敗");
      setToken(r.token, r.username);
      $("#loginPwd").value = "";
      showManage();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      $("#loginBtn").disabled = false;
    }
  });

  // -------------------------------------------------- list
  let allRows = [];
  let allHeaders = [];

  async function loadList() {
    const status = $("#manageStatus");
    const wrap = $("#tableWrap");
    status.hidden = false;
    status.textContent = "載入中…";
    wrap.hidden = true;
    try {
      const r = await api("list");
      allRows = r.rows;
      allHeaders = r.headers;
      status.hidden = true;
      wrap.hidden = false;
      renderTable();
    } catch (e) {
      status.textContent = "讀取失敗：" + e.message;
    }
  }

  function truthy(v) {
    if (v === true) return true;
    const s = String(v ?? "").trim().toLowerCase();
    return ["1","true","yes","y","v","✓","勾","勾選","是","有","on"].includes(s);
  }
  function num(v) {
    if (v === "" || v == null) return null;
    const n = Number(String(v).replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function renderTable() {
    const q = $("#search").value.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const tbody = $("#prodBody");
    tbody.textContent = "";

    const filtered = allRows.filter(r => {
      if (!tokens.length) return true;
      const hay = [
        r["商品名稱"] || r["name"] || "",
        r["症狀關鍵字"] || r["keywords"] || "",
        r["適用性"] || r["usage"] || "",
        r["id"] || "",
      ].join(" ").toLowerCase();
      return tokens.every(t => hay.includes(t));
    });

    for (const row of filtered) {
      const tr = document.createElement("tr");
      tr.dataset.row = row._row;
      tr.dataset.id = row.id;

      const consult = truthy(row["諮詢藥師"]);
      const hot = truthy(row["熱賣"]);
      const sold = truthy(row["完售"]);
      const hide = truthy(row["隱藏"]);
      const qty = num(row["剩餘數量"]);
      const priceOrig = num(row["原價"]);
      const priceSale = num(row["特價"]);
      const name = row["商品名稱"] || "(未命名)";
      const image = row["image"] || row["圖片"] || "";
      const igCaption = (row["_caption_預覽"] || "").split("\n")[0] || "";

      // image cell
      const tdImg = document.createElement("td");
      const imgWrap = document.createElement("div");
      imgWrap.className = "thumb-wrap";
      const img = document.createElement("img");
      img.className = "thumb" + (sold ? " is-sold" : "");
      img.alt = "";
      img.loading = "lazy";
      img.src = resolveImage(image, row.id);
      img.onerror = () => { img.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'><rect width='56' height='56' fill='%23eee'/><text x='28' y='32' text-anchor='middle' fill='%23999' font-size='10'>no img</text></svg>"; };
      imgWrap.append(img);
      tdImg.append(imgWrap);

      // name
      const tdName = document.createElement("td");
      tdName.className = "cell-name";
      const nameDiv = document.createElement("div");
      nameDiv.textContent = name;
      tdName.append(nameDiv);
      if (igCaption && igCaption !== name) {
        const sm = document.createElement("small");
        sm.textContent = igCaption.length > 40 ? igCaption.substring(0,40) + "…" : igCaption;
        tdName.append(sm);
      }

      // prices
      const tdOrig = document.createElement("td");
      tdOrig.className = "num";
      tdOrig.textContent = priceOrig != null ? "$" + priceOrig.toLocaleString("zh-TW") : "—";
      if (priceOrig != null) tdOrig.classList.add("price-orig");

      const tdSale = document.createElement("td");
      tdSale.className = "num";
      if (consult) {
        tdSale.textContent = "諮詢";
        tdSale.style.color = "#2f6b4f";
      } else if (priceSale != null) {
        tdSale.textContent = "$" + priceSale.toLocaleString("zh-TW");
        tdSale.classList.add("price-sale");
      } else {
        tdSale.textContent = "—";
      }

      // qty
      const tdQty = document.createElement("td");
      tdQty.className = "num";
      if (qty == null || qty <= 0) {
        tdQty.textContent = "—";
      } else {
        tdQty.textContent = qty;
        if (qty <= 5) tdQty.classList.add("qty-warn");
      }

      // checkboxes
      const tdConsult = mkCb(row._row, "諮詢藥師", consult);
      const tdHot = mkCb(row._row, "熱賣", hot);
      const tdSold = mkCb(row._row, "完售", sold);
      const tdHide = mkCb(row._row, "隱藏", hide);

      // edit
      const tdEdit = document.createElement("td");
      tdEdit.className = "action";
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "編輯";
      editBtn.onclick = () => openEditModal(row);
      tdEdit.append(editBtn);

      tr.append(tdImg, tdName, tdOrig, tdSale, tdQty, tdConsult, tdHot, tdSold, tdHide, tdEdit);
      tbody.append(tr);
    }

    if (filtered.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 10;
      td.style.textAlign = "center";
      td.style.padding = "40px 20px";
      td.style.color = "#888";
      td.textContent = q ? "沒有符合的商品" : "（試算表沒資料）";
      tr.append(td);
      tbody.append(tr);
    }
  }

  // 圖片路徑解析：sheet 有填 image 就用，否則嘗試對應 IG 圖
  function resolveImage(sheetImage, id) {
    if (sheetImage) {
      // 如果是相對路徑（images/xxx.jpg） → 加 ../ (因為我們在 /ruthie/)
      if (!/^https?:/i.test(sheetImage) && !sheetImage.startsWith("/")) {
        return "../" + sheetImage;
      }
      return sheetImage;
    }
    // 預設：用 IG post_id 對應 site/images/{id}.jpg
    return `../images/${id}.jpg`;
  }

  function mkCb(row, field, checked) {
    const td = document.createElement("td");
    td.className = "cb cb-cell";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!checked;
    cb.onchange = async () => {
      cb.disabled = true;
      try {
        await api("update", { row, field, value: cb.checked ? "TRUE" : "FALSE" });
        // 更新本地資料
        const r = allRows.find(r => r._row === row);
        if (r) r[field] = cb.checked ? "TRUE" : "FALSE";
        // 完售要更新樣式 → 重繪該列
        if (field === "完售" || field === "諮詢藥師") renderTable();
      } catch (e) {
        cb.checked = !cb.checked;
        toast("儲存失敗：" + e.message, true);
      } finally {
        cb.disabled = false;
      }
    };
    td.append(cb);
    return td;
  }

  // -------------------------------------------------- search
  let searchTimer;
  $("#search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderTable, 150);
  });

  // -------------------------------------------------- reload / logout
  $("#reloadBtn").onclick = () => loadList();
  $("#logoutBtn").onclick = () => {
    clearToken();
    showLogin();
  };

  // -------------------------------------------------- edit modal
  let pendingImageBase64 = null;
  let pendingImageName = null;
  let editingMode = "edit"; // "edit" | "add"

  function openEditModal(row) {
    editingMode = "edit";
    $("#editTitle").textContent = "編輯：" + (row["商品名稱"] || row.id);
    $("#editRow").value = row._row;
    $("#editId").value = row.id;
    $("#f_name").value = row["商品名稱"] || "";
    $("#f_priceOrig").value = num(row["原價"]) ?? "";
    $("#f_priceSale").value = num(row["特價"]) ?? "";
    $("#f_keywords").value = row["症狀關鍵字"] || "";
    $("#f_usage").value = row["適用性"] || "";
    $("#f_qty").value = num(row["剩餘數量"]) ?? "";
    $("#f_consult").checked = truthy(row["諮詢藥師"]);
    $("#f_hot").checked = truthy(row["熱賣"]);
    $("#f_soldOut").checked = truthy(row["完售"]);
    $("#f_hide").checked = truthy(row["隱藏"]);
    // 編輯模式不顯示圖片上傳（IG 商品的圖不能改；之後想擴充再說）
    $("#imageBlock").hidden = !!row.id && !row.id.startsWith("manual-") && !!(row["image"] === "" || !row["image"]);
    // 但若是 manual- 開頭，可以重新上傳
    if (row.id && row.id.startsWith("manual-")) $("#imageBlock").hidden = false;
    resetDropzone();
    $("#editErr").hidden = true;
    $("#editModal").hidden = false;
  }

  function openAddModal() {
    editingMode = "add";
    $("#editTitle").textContent = "新增商品";
    $("#editRow").value = "";
    $("#editId").value = "manual-" + Date.now();
    $("#f_name").value = "";
    $("#f_priceOrig").value = "";
    $("#f_priceSale").value = "";
    $("#f_keywords").value = "";
    $("#f_usage").value = "";
    $("#f_qty").value = "";
    $("#f_consult").checked = false;
    $("#f_hot").checked = false;
    $("#f_soldOut").checked = false;
    $("#f_hide").checked = false;
    $("#imageBlock").hidden = false;
    resetDropzone();
    $("#editErr").hidden = true;
    $("#editModal").hidden = false;
  }
  $("#addBtn").onclick = openAddModal;

  function resetDropzone() {
    pendingImageBase64 = null;
    pendingImageName = null;
    $("#dropPreview").hidden = true;
    $("#dropPreview").src = "";
    $("#dropHint").hidden = false;
    $("#f_image").value = "";
  }

  // dropzone
  const dz = $("#dropzone");
  dz.onclick = () => $("#f_image").click();
  $("#f_image").onchange = (e) => handleFile(e.target.files[0]);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("is-drag"); };
  dz.ondragleave = () => dz.classList.remove("is-drag");
  dz.ondrop = (e) => {
    e.preventDefault();
    dz.classList.remove("is-drag");
    handleFile(e.dataTransfer.files[0]);
  };

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("請選擇圖片檔", true); return; }
    if (file.size > 5 * 1024 * 1024) { toast("圖片超過 5MB", true); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      pendingImageBase64 = base64;
      pendingImageName = file.name;
      $("#dropPreview").src = dataUrl;
      $("#dropPreview").hidden = false;
      $("#dropHint").hidden = true;
    };
    reader.readAsDataURL(file);
  }

  // close modal
  document.querySelectorAll("[data-close]").forEach(el => {
    el.addEventListener("click", (e) => {
      const m = e.target.closest(".modal");
      if (m) m.hidden = true;
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal").forEach(m => m.hidden = true);
    }
  });

  // submit edit/add
  $("#editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("#editErr");
    errEl.hidden = true;
    $("#saveBtn").disabled = true;

    try {
      let imagePath = null;
      if (pendingImageBase64) {
        const r = await api("uploadImage", {
          filename: pendingImageName,
          contentBase64: pendingImageBase64,
        });
        imagePath = r.image;
      }

      const fields = {
        id: $("#editId").value,
        "商品名稱": $("#f_name").value.trim(),
        "原價": $("#f_priceOrig").value || "",
        "特價": $("#f_priceSale").value || "",
        "症狀關鍵字": $("#f_keywords").value.trim(),
        "適用性": $("#f_usage").value.trim(),
        "剩餘數量": $("#f_qty").value || "",
        "諮詢藥師": $("#f_consult").checked ? "TRUE" : "",
        "熱賣": $("#f_hot").checked ? "TRUE" : "",
        "完售": $("#f_soldOut").checked ? "TRUE" : "",
        "隱藏": $("#f_hide").checked ? "TRUE" : "",
      };
      if (imagePath) fields["image"] = imagePath;

      if (editingMode === "add") {
        // 圖片是必填（手動新增商品要有圖）
        if (!imagePath) {
          errEl.textContent = "新增商品請上傳商品圖";
          errEl.hidden = false;
          $("#saveBtn").disabled = false;
          return;
        }
        await api("add", { fields });
        toast("✓ 已新增商品");
      } else {
        const row = Number($("#editRow").value);
        // 一個一個 update（簡單但慢；未來可批次）
        for (const [field, value] of Object.entries(fields)) {
          if (field === "id") continue;
          // 跳過沒這欄的（試算表如果還沒加 image 欄就不送）
          if (!allHeaders.includes(field)) {
            if (field === "image" && imagePath) {
              errEl.textContent = "試算表沒有 image 欄位，請先在試算表最右邊加一欄叫 image";
              errEl.hidden = false;
              $("#saveBtn").disabled = false;
              return;
            }
            continue;
          }
          await api("update", { row, field, value });
        }
        toast("✓ 已儲存");
      }

      $("#editModal").hidden = true;
      await loadList();
    } catch (e) {
      errEl.textContent = "儲存失敗：" + e.message;
      errEl.hidden = false;
    } finally {
      $("#saveBtn").disabled = false;
    }
  });

  // -------------------------------------------------- change password
  $("#changePwdBtn").onclick = () => {
    $("#newPwd1").value = "";
    $("#newPwd2").value = "";
    $("#pwdErr").hidden = true;
    $("#pwdModal").hidden = false;
  };
  $("#pwdForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p1 = $("#newPwd1").value;
    const p2 = $("#newPwd2").value;
    const err = $("#pwdErr");
    if (p1.length < 8) { err.textContent = "密碼至少 8 字元"; err.hidden = false; return; }
    if (p1 !== p2) { err.textContent = "兩次輸入不一致"; err.hidden = false; return; }
    try {
      await api("changePassword", { newPassword: p1 });
      $("#pwdModal").hidden = true;
      toast("✓ 密碼已更新，下次登入請用新密碼");
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  });

  // -------------------------------------------------- init
  if (getToken()) showManage();
  else showLogin();

})();
