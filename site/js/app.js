/* ====================================================================
 *  惠登藥局網站 — 前端邏輯
 *  讀取 data/posts.json (IG 抓下來的圖片 + 描述)
 *  讀取 Google 試算表 CSV (商品價格、熱賣、完售…等)
 *  以 id 為主鍵合併 → 渲染卡片 + 搜尋 + 詳細視窗
 * ==================================================================== */

(() => {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const $ = (sel) => document.querySelector(sel);

  const els = {
    status: $("#status"),
    gallery: $("#gallery"),
    empty: $("#empty"),
    search: $("#searchInput"),
    searchClear: $("#searchClear"),
    modal: $("#modal"),
    modalImage: $("#modalImage"),
    modalTitle: $("#modalTitle"),
    modalPrice: $("#modalPrice"),
    modalUsage: $("#modalUsage"),
    modalQty: $("#modalQty"),
    modalCaption: $("#modalCaption"),
    modalIgLink: $("#modalIgLink"),
    modalStamps: $("#modalStamps"),
    year: $("#year"),
  };

  els.year.textContent = new Date().getFullYear();

  // -------------------------------------------------- helpers
  const truthy = (v) => {
    if (v === undefined || v === null) return false;
    const s = String(v).trim().toLowerCase();
    return ["1", "true", "yes", "y", "v", "✓", "勾", "勾選", "是", "有", "on"].includes(s);
  };

  const num = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(String(v).replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const escapeHTML = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // CSV parser that handles quoted fields with commas / newlines
  function parseCSV(text) {
    const rows = [];
    let cur = [""];
    let i = 0;
    let inQuotes = false;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') {
          cur[cur.length - 1] += '"';
          i += 2;
          continue;
        }
        if (c === '"') {
          inQuotes = false;
          i++;
          continue;
        }
        cur[cur.length - 1] += c;
        i++;
      } else {
        if (c === '"') {
          inQuotes = true;
          i++;
          continue;
        }
        if (c === ",") {
          cur.push("");
          i++;
          continue;
        }
        if (c === "\r") {
          i++;
          continue;
        }
        if (c === "\n") {
          rows.push(cur);
          cur = [""];
          i++;
          continue;
        }
        cur[cur.length - 1] += c;
        i++;
      }
    }
    if (cur.length > 1 || cur[0] !== "") rows.push(cur);
    return rows;
  }

  // Map header → row of objects, also accepting Chinese aliases.
  const HEADER_ALIASES = {
    id: ["id", "post_id", "貼文id", "貼文編號", "編號"],
    shortcode: ["shortcode", "post_shortcode"],
    name: ["name", "title", "商品名稱", "藥品名稱", "名稱"],
    keywords: ["keywords", "症狀", "症狀關鍵字", "搜尋關鍵字", "關鍵字"],
    priceOriginal: ["priceOriginal", "原價", "定價"],
    priceSale: ["priceSale", "特價", "售價"],
    consult: ["consult", "consultPharmacist", "諮詢藥師", "請洽藥師", "不公開價格"],
    hot: ["hot", "熱賣", "熱銷"],
    soldOut: ["soldOut", "完售", "售完", "已售完"],
    qty: ["qty", "quantity", "剩餘數量", "庫存", "數量"],
    usage: ["usage", "適用性", "適用範圍", "適應症"],
    hide: ["hide", "隱藏", "不顯示"],
  };

  function csvToObjects(csvText) {
    const rows = parseCSV(csvText).filter((r) => r.some((c) => c && c.trim() !== ""));
    if (rows.length === 0) return [];
    const headerRow = rows[0].map((h) => h.trim());
    const indexOf = {};
    for (const [canon, aliases] of Object.entries(HEADER_ALIASES)) {
      const idx = headerRow.findIndex((h) =>
        aliases.some((a) => h.toLowerCase() === a.toLowerCase())
      );
      indexOf[canon] = idx; // -1 if missing
    }
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = (key) => {
        const i = indexOf[key];
        return i >= 0 ? (row[i] ?? "").trim() : "";
      };
      const id = get("id");
      if (!id) continue;
      out.push({
        id,
        shortcode: get("shortcode"),
        name: get("name"),
        keywords: get("keywords"),
        priceOriginal: num(get("priceOriginal")),
        priceSale: num(get("priceSale")),
        consult: truthy(get("consult")),
        hot: truthy(get("hot")),
        soldOut: truthy(get("soldOut")),
        qty: num(get("qty")),
        usage: get("usage"),
        hide: truthy(get("hide")),
      });
    }
    return out;
  }

  async function fetchPosts() {
    const res = await fetch(cfg.POSTS_JSON_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`posts.json: ${res.status}`);
    return res.json();
  }

  async function fetchSheet() {
    if (!cfg.SHEET_CSV_URL) return [];
    try {
      const res = await fetch(cfg.SHEET_CSV_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`sheet: ${res.status}`);
      const text = await res.text();
      return csvToObjects(text);
    } catch (e) {
      console.warn("無法載入 Google 試算表，使用 IG 預設資料：", e);
      return [];
    }
  }

  function mergeData(posts, sheetRows) {
    const sheetById = new Map();
    for (const r of sheetRows) sheetById.set(r.id, r);
    return posts.map((p) => {
      const s = sheetById.get(p.id) || {};
      return {
        id: p.id,
        shortcode: p.shortcode || s.shortcode || "",
        title: s.name || p.title || "(未命名商品)",
        caption: p.caption || "",
        keywords: s.keywords || p.keywords || "",
        priceOriginal: s.priceOriginal,
        priceSale: s.priceSale,
        consult: !!s.consult,
        hot: !!s.hot,
        soldOut: !!s.soldOut,
        qty: s.qty,
        usage: s.usage || "",
        hide: !!s.hide,
        url: p.url,
        images: p.images || [],
      };
    });
  }

  // -------------------------------------------------- render
  function renderPriceHTML(item, big = false) {
    if (item.consult) {
      return `<span class="price-consult">諮詢藥師</span>`;
    }
    const has = (v) => v !== undefined && v !== null && !Number.isNaN(v);
    const fmt = (v) => v.toLocaleString("zh-TW");
    if (has(item.priceSale) && has(item.priceOriginal) && item.priceSale < item.priceOriginal) {
      return `<span class="price">
        <span class="price-sale">${fmt(item.priceSale)}</span>
        <span class="price-original">${fmt(item.priceOriginal)}</span>
      </span>`;
    }
    if (has(item.priceSale)) {
      return `<span class="price"><span class="price-only">${fmt(item.priceSale)}</span></span>`;
    }
    if (has(item.priceOriginal)) {
      return `<span class="price"><span class="price-only">${fmt(item.priceOriginal)}</span></span>`;
    }
    return ""; // no price set
  }

  function stampsHTML(item) {
    const parts = [];
    if (item.soldOut) parts.push(`<div class="stamp is-sold">完售</div>`);
    else if (item.hot) parts.push(`<div class="stamp is-hot">熱賣</div>`);
    return parts.join("");
  }

  function qtyHTML(item) {
    if (item.qty === null || item.qty === undefined) return "";
    if (item.qty <= 0) return ""; // hide if zero
    const low = item.qty <= 5 ? "is-low" : "";
    return `<span class="qty ${low}">剩 ${item.qty} 件</span>`;
  }

  function highlight(text, query) {
    if (!query) return escapeHTML(text);
    const safe = escapeHTML(text);
    const parts = query
      .split(/\s+/)
      .filter(Boolean)
      .map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (parts.length === 0) return safe;
    const re = new RegExp(`(${parts.join("|")})`, "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  function renderCard(item, query) {
    const card = document.createElement("article");
    card.className = "card" + (item.soldOut ? " is-sold" : "");
    card.dataset.id = item.id;
    const cover = item.images[0] || "";
    card.innerHTML = `
      <div class="card-image-wrap">
        <img loading="lazy" src="${escapeHTML(cover)}" alt="${escapeHTML(item.title)}" />
        <div class="stamps">${stampsHTML(item)}</div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${highlight(item.title, query)}</h3>
        ${item.usage ? `<div class="card-usage">${highlight(item.usage, query)}</div>` : ""}
        <div class="card-meta">
          ${renderPriceHTML(item)}
          ${qtyHTML(item)}
        </div>
      </div>
    `;
    card.addEventListener("click", () => openModal(item));
    return card;
  }

  function renderGallery(items, query) {
    els.gallery.innerHTML = "";
    if (items.length === 0) {
      els.gallery.hidden = true;
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
    els.gallery.hidden = false;
    const frag = document.createDocumentFragment();
    for (const it of items) frag.appendChild(renderCard(it, query));
    els.gallery.appendChild(frag);
  }

  // -------------------------------------------------- modal
  function openModal(item) {
    els.modal.hidden = false;
    els.modal.classList.toggle("is-sold", item.soldOut);
    els.modalImage.src = item.images[0] || "";
    els.modalImage.alt = item.title;
    els.modalTitle.textContent = item.title;
    els.modalPrice.innerHTML = renderPriceHTML(item, true);
    if (item.usage) {
      els.modalUsage.hidden = false;
      els.modalUsage.textContent = item.usage;
    } else {
      els.modalUsage.hidden = true;
      els.modalUsage.textContent = "";
    }
    if (item.qty && item.qty > 0) {
      els.modalQty.hidden = false;
      els.modalQty.classList.toggle("is-low", item.qty <= 5);
      els.modalQty.textContent = `剩餘數量：${item.qty} 件`;
    } else {
      els.modalQty.hidden = true;
      els.modalQty.textContent = "";
    }
    els.modalCaption.textContent = item.caption || "";
    els.modalCaption.hidden = !item.caption;
    if (item.url) {
      els.modalIgLink.hidden = false;
      els.modalIgLink.href = item.url;
    } else {
      els.modalIgLink.hidden = true;
    }
    els.modalStamps.innerHTML = stampsHTML(item);
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    els.modal.hidden = true;
    document.body.style.overflow = "";
  }

  els.modal.addEventListener("click", (e) => {
    if (e.target.matches("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.modal.hidden) closeModal();
  });

  // -------------------------------------------------- search
  function buildSearchString(item) {
    return [
      item.title,
      item.keywords,
      item.usage,
      item.caption,
    ]
      .filter(Boolean)
      .join(" \n ")
      .toLowerCase();
  }

  function applyFilter(allItems, query) {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.filter((i) => !i.hide);
    const tokens = q.split(/\s+/).filter(Boolean);
    return allItems.filter((i) => {
      if (i.hide) return false;
      const hay = i._search;
      return tokens.every((t) => hay.includes(t));
    });
  }

  // -------------------------------------------------- main
  let allItems = [];

  function rerender() {
    const q = els.search.value;
    els.searchClear.hidden = !q;
    const filtered = applyFilter(allItems, q);
    renderGallery(filtered, q);
  }

  els.search.addEventListener("input", rerender);
  els.searchClear.addEventListener("click", () => {
    els.search.value = "";
    els.search.focus();
    rerender();
  });

  async function init() {
    try {
      const [posts, sheet] = await Promise.all([fetchPosts(), fetchSheet()]);
      allItems = mergeData(posts, sheet).map((i) => ({
        ...i,
        _search: buildSearchString(i),
      }));
      els.status.hidden = true;
      rerender();
    } catch (e) {
      console.error(e);
      els.status.textContent = "資料載入失敗：" + e.message;
    }
  }

  init();
})();
