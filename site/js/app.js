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
    modalOverlay: $("#modalOverlay"),
    year: $("#year"),
  };

  els.year.textContent = new Date().getFullYear();

  // -------------------------------------------------- SEO meta：商品 modal 動態切換
  const SITE_ORIGIN = "https://wheadon-pharmacy.pages.dev";

  function getMeta(selector) {
    return document.head.querySelector(selector);
  }
  function ensureMeta(selector, attrName, attrValue) {
    let el = getMeta(selector);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attrName, attrValue);
      document.head.appendChild(el);
    }
    return el;
  }
  function ensureLink(rel) {
    let el = document.head.querySelector(`link[rel="${rel}"]`);
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", rel);
      document.head.appendChild(el);
    }
    return el;
  }

  const seoEls = {
    title: document.querySelector("title"),
    description: ensureMeta('meta[name="description"]', "name", "description"),
    ogTitle: ensureMeta('meta[property="og:title"]', "property", "og:title"),
    ogDescription: ensureMeta('meta[property="og:description"]', "property", "og:description"),
    ogImage: ensureMeta('meta[property="og:image"]', "property", "og:image"),
    ogUrl: ensureMeta('meta[property="og:url"]', "property", "og:url"),
    twTitle: getMeta('meta[name="twitter:title"]'),
    twDescription: getMeta('meta[name="twitter:description"]'),
    twImage: getMeta('meta[name="twitter:image"]'),
    canonical: ensureLink("canonical"),
  };
  // 儲存首頁預設 meta，關閉 modal 時還原
  const seoDefaults = {
    title: seoEls.title ? seoEls.title.textContent : "",
    description: seoEls.description.getAttribute("content") || "",
    ogTitle: seoEls.ogTitle.getAttribute("content") || "",
    ogDescription: seoEls.ogDescription.getAttribute("content") || "",
    ogImage: seoEls.ogImage.getAttribute("content") || "",
    ogUrl: seoEls.ogUrl.getAttribute("content") || `${SITE_ORIGIN}/`,
    twTitle: seoEls.twTitle ? seoEls.twTitle.getAttribute("content") || "" : "",
    twDescription: seoEls.twDescription ? seoEls.twDescription.getAttribute("content") || "" : "",
    twImage: seoEls.twImage ? seoEls.twImage.getAttribute("content") || "" : "",
    canonical: seoEls.canonical.getAttribute("href") || `${SITE_ORIGIN}/`,
  };

  function absoluteImageUrl(src) {
    if (!src) return seoDefaults.ogImage;
    if (/^https?:\/\//i.test(src)) return src;
    return `${SITE_ORIGIN}/${src.replace(/^\//, "")}`;
  }

  // 把 "images/xxx.jpg" 等相對路徑變成 "/images/xxx.jpg"
  // 避免在 /products/N 子路徑下被解析成 /products/N/images/...
  function resolveImageSrc(src) {
    if (!src) return "";
    if (/^https?:\/\//i.test(src) || src.startsWith("/")) return src;
    return "/" + src;
  }

  function shortDescription(item) {
    const raw = (item.usage || item.caption || "").toString();
    // 取前 100 字、移除多餘空白
    const trimmed = raw.replace(/\s+/g, " ").trim();
    if (!trimmed) return seoDefaults.description;
    return trimmed.length > 100 ? trimmed.slice(0, 100) + "…" : trimmed;
  }

  function updateSEOForItem(item) {
    const title = `${item.title} ｜ 惠登藥局`;
    const desc = shortDescription(item);
    const img = absoluteImageUrl(item.images && item.images[0]);
    const url = item.serial
      ? `${SITE_ORIGIN}/products/${item.serial}`
      : seoDefaults.canonical;
    if (seoEls.title) seoEls.title.textContent = title;
    seoEls.description.setAttribute("content", desc);
    seoEls.ogTitle.setAttribute("content", title);
    seoEls.ogDescription.setAttribute("content", desc);
    seoEls.ogImage.setAttribute("content", img);
    seoEls.ogUrl.setAttribute("content", url);
    if (seoEls.twTitle) seoEls.twTitle.setAttribute("content", title);
    if (seoEls.twDescription) seoEls.twDescription.setAttribute("content", desc);
    if (seoEls.twImage) seoEls.twImage.setAttribute("content", img);
    seoEls.canonical.setAttribute("href", url);
  }

  function resetSEOToDefaults() {
    if (seoEls.title) seoEls.title.textContent = seoDefaults.title;
    seoEls.description.setAttribute("content", seoDefaults.description);
    seoEls.ogTitle.setAttribute("content", seoDefaults.ogTitle);
    seoEls.ogDescription.setAttribute("content", seoDefaults.ogDescription);
    seoEls.ogImage.setAttribute("content", seoDefaults.ogImage);
    seoEls.ogUrl.setAttribute("content", seoDefaults.ogUrl);
    if (seoEls.twTitle) seoEls.twTitle.setAttribute("content", seoDefaults.twTitle);
    if (seoEls.twDescription) seoEls.twDescription.setAttribute("content", seoDefaults.twDescription);
    if (seoEls.twImage) seoEls.twImage.setAttribute("content", seoDefaults.twImage);
    seoEls.canonical.setAttribute("href", seoDefaults.canonical);
  }

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
    image: ["image", "圖片", "圖片網址", "image_url"],
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
    let serial = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = (key) => {
        const i = indexOf[key];
        return i >= 0 ? (row[i] ?? "").trim() : "";
      };
      const id = get("id");
      if (!id) continue;
      serial++;   // 每筆商品的流水編號（試算表 row 順序）
      out.push({
        id,
        serial,
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
        image: get("image"),
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
    const usedSheetIds = new Set();

    // 1. IG 貼文 + 試算表合併（以 IG 為主）
    const merged = posts.map((p) => {
      const s = sheetById.get(p.id) || {};
      if (s.id) usedSheetIds.add(s.id);
      return {
        id: p.id,
        serial: s.serial,
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
        // 試算表的 image 欄位優先（如果有填，取代 IG 圖）
        images: s.image ? [s.image] : (p.images || []),
      };
    });

    // 2. 純試算表新增的商品（沒對應 IG 貼文，但有填 image 欄位）
    for (const s of sheetRows) {
      if (usedSheetIds.has(s.id)) continue;
      if (!s.image) continue;
      merged.unshift({   // 放在最前面，新商品比較顯眼
        id: s.id,
        serial: s.serial,
        shortcode: s.shortcode || "",
        title: s.name || "(未命名商品)",
        caption: "",
        keywords: s.keywords || "",
        priceOriginal: s.priceOriginal,
        priceSale: s.priceSale,
        consult: !!s.consult,
        hot: !!s.hot,
        soldOut: !!s.soldOut,
        qty: s.qty,
        usage: s.usage || "",
        hide: !!s.hide,
        url: "",
        images: [s.image],
      });
    }

    return merged;
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

  // 完售：滿版印章 + 圖片變灰
  // 熱賣：上方跑馬燈，不擋商品本身
  function overlayHTML(item) {
    if (item.soldOut) {
      return `<div class="stamps"><div class="stamp is-sold">完售</div></div>`;
    }
    if (item.hot) {
      const seg = "熱賣中　・　".repeat(8);
      return `<div class="hot-marquee" aria-label="熱賣中"><div class="hot-marquee-track"><span>${seg}</span><span>${seg}</span></div></div>`;
    }
    return "";
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
    const cover = resolveImageSrc(item.images[0]);
    card.innerHTML = `
      <div class="card-image-wrap">
        <img loading="lazy" width="1080" height="1080" src="${escapeHTML(cover)}" alt="${escapeHTML(item.title)}" />
        ${overlayHTML(item)}
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
  let currentModalItem = null;

  function openModal(item, updateURL = true) {
    currentModalItem = item;
    els.modal.hidden = false;
    els.modal.classList.toggle("is-sold", item.soldOut);
    els.modalImage.src = resolveImageSrc(item.images[0]);
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
    els.modalOverlay.innerHTML = overlayHTML(item);

    // 分享按鈕：只在有 serial 時可用
    const shareBtn = $("#modalShareBtn");
    if (shareBtn) shareBtn.hidden = !item.serial;

    // 改網址成 /products/{serial}
    if (updateURL && item.serial) {
      const newPath = `/products/${item.serial}`;
      if (location.pathname !== newPath) {
        history.pushState({ serial: item.serial }, "", newPath);
      }
    }

    // 更新 SEO meta（title / description / og / canonical）
    updateSEOForItem(item);

    document.body.style.overflow = "hidden";
  }

  function closeModal(updateURL = true) {
    els.modal.hidden = true;
    currentModalItem = null;
    document.body.style.overflow = "";
    if (updateURL && location.pathname.startsWith("/products/")) {
      history.pushState({}, "", "/");
    }
    // 還原首頁的 SEO meta
    resetSEOToDefaults();
  }

  els.modal.addEventListener("click", (e) => {
    if (e.target.matches("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.modal.hidden) closeModal();
  });

  // 瀏覽器上一頁/下一頁 → 對應開關 modal
  window.addEventListener("popstate", () => {
    routeFromURL(false);
  });

  // 從目前網址判斷該開哪個商品的 modal（或關閉）
  function routeFromURL(updateURL = true) {
    const m = location.pathname.match(/^\/products\/(\d+)\/?$/);
    if (!m) {
      if (!els.modal.hidden) closeModal(false);
      return;
    }
    const serial = Number(m[1]);
    const item = allItems.find((i) => i.serial === serial && !i.hide);
    if (item) {
      openModal(item, updateURL);
    } else {
      // 找不到就關 modal、保留路徑（避免使用者誤以為連結壞了）
      if (!els.modal.hidden) closeModal(false);
    }
  }

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

  // Levenshtein 編輯距離（用於模糊搜尋打錯字容忍）
  function levenshtein(a, b) {
    if (a === b) return 0;
    const al = a.length, bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    let prev = new Array(bl + 1);
    let curr = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;
    for (let i = 1; i <= al; i++) {
      curr[0] = i;
      const ac = a.charCodeAt(i - 1);
      for (let j = 1; j <= bl; j++) {
        const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(
          curr[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + cost
        );
      }
      const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[bl];
  }

  // 在 hay 中尋找最接近 token 的子字串，回傳最小編輯距離
  function bestSubstringDist(hay, token, maxDist) {
    const tl = token.length;
    if (tl === 0) return 0;
    if (hay.includes(token)) return 0;
    let best = Infinity;
    const minLen = Math.max(1, tl - maxDist);
    const maxLen = tl + maxDist;
    const hl = hay.length;
    for (let len = minLen; len <= maxLen; len++) {
      for (let i = 0; i + len <= hl; i++) {
        const d = levenshtein(hay.substr(i, len), token);
        if (d < best) {
          best = d;
          if (best === 0) return 0;
        }
      }
    }
    return best;
  }

  // 每個 token 容許的最大編輯距離（依長度動態決定）
  function fuzzyTolerance(token) {
    const len = token.length;
    if (len <= 2) return 0;  // 太短：要求完整命中，避免誤判
    if (len <= 4) return 1;
    if (len <= 7) return 2;
    return 2;
  }

  function tokenMatches(hay, token) {
    if (hay.includes(token)) return true;
    const tol = fuzzyTolerance(token);
    if (tol === 0) return false;
    return bestSubstringDist(hay, token, tol) <= tol;
  }

  function applyFilter(allItems, query) {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.filter((i) => !i.hide);
    const tokens = q.split(/\s+/).filter(Boolean);
    return allItems.filter((i) => {
      if (i.hide) return false;
      const hay = i._search;
      return tokens.every((t) => tokenMatches(hay, t));
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

  // 從 HTML 內嵌的 JSON 讀預渲染好的商品清單 (build_data.py 寫進去)
  function readEmbeddedProducts() {
    const el = document.getElementById("productsData");
    if (!el) return null;
    const text = (el.textContent || "").trim();
    if (!text || text === "[]") return null;
    try {
      const data = JSON.parse(text);
      return Array.isArray(data) && data.length > 0 ? data : null;
    } catch (e) {
      console.warn("productsData JSON 解析失敗", e);
      return null;
    }
  }

  async function init() {
    try {
      // 優先用預渲染資料（後台「重新發布」後寫進 HTML）
      const embedded = readEmbeddedProducts();
      if (embedded) {
        allItems = embedded.map((i) => ({
          ...i,
          _search: buildSearchString(i),
        }));
      } else {
        // 沒預渲染資料 → 退回舊的「即時抓 CSV」方式（向後相容）
        const [posts, sheet] = await Promise.all([fetchPosts(), fetchSheet()]);
        allItems = mergeData(posts, sheet).map((i) => ({
          ...i,
          _search: buildSearchString(i),
        }));
      }
      els.status.hidden = true;
      rerender();
      // 如果網址是 /products/N，開對應的 modal
      routeFromURL(false);
    } catch (e) {
      console.error(e);
      els.status.textContent = "資料載入失敗：" + e.message;
    }
  }

  // 分享按鈕：複製目前網址
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "modalShareBtn") {
      const url = location.origin + location.pathname;
      const ok = (msg) => {
        e.target.textContent = msg;
        setTimeout(() => { e.target.textContent = "🔗 複製連結"; }, 1500);
      };
      if (window.dataLayer) {
        window.dataLayer.push({
          event: "copy_product_link",
          page_path: location.pathname,
          page_url: url,
        });
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => ok("✓ 已複製"));
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); ok("✓ 已複製"); } catch (e) {}
        ta.remove();
      }
    }
  });

  init();

  // -------------------------------------------------- Bundle 卡：點擊 → 自動篩選 + 滾到 gallery
  document.addEventListener("click", (e) => {
    const link = e.target.closest(".bundle-cta[data-q]");
    if (!link) return;
    // 內部錨點（#gallery）才攔截；外部連結（LINE、tel）放行
    const href = link.getAttribute("href") || "";
    if (!href.startsWith("#")) return;
    e.preventDefault();
    const q = (link.getAttribute("data-q") || "").trim();
    if (els.search) {
      els.search.value = q;
      els.search.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const gallery = document.getElementById("gallery");
    if (gallery) {
      gallery.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // 浮動 CTA：永遠顯示（50+ 客群消失時容易誤以為點不到）
  // 之前依滾動方向顯隱的邏輯已移除

  // -------------------------------------------------- 首頁 banner：下滾即淡出+收合
  const banner = $("#siteBanner");
  if (banner) {
    let bTicking = false;
    function onBannerScroll() {
      if (bTicking) return;
      bTicking = true;
      requestAnimationFrame(() => {
        if (window.scrollY > 24) banner.classList.add("is-hidden");
        else banner.classList.remove("is-hidden");
        bTicking = false;
      });
    }
    window.addEventListener("scroll", onBannerScroll, { passive: true });
  }
})();
