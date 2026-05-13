"""
Build site:
  - Read gallery-dl output in ig_raw/, build site/data/posts.json
  - Copy images into site/images/
  - Fetch Google Sheet CSV, merge with posts, pre-render gallery into index.html
  - Generate static product pages site/products/{N}/index.html
  - Generate sitemap.xml

Run:
  python build_data.py
"""

import csv
import io
import json
import os
import re
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
IG_DIR = ROOT / "ig_raw" / "instagram" / "wheadonpharmacy"
SITE = ROOT / "site"
IMG_OUT = SITE / "images"
DATA_OUT = SITE / "data"

SITE_BASE_URL = "https://wheadon-pharmacy.pages.dev"

IMG_OUT.mkdir(parents=True, exist_ok=True)
DATA_OUT.mkdir(parents=True, exist_ok=True)


# ----------------------------------------------------------------------
# 讀 site/js/config.js 抓出 SHEET_CSV_URL（單一來源）
# ----------------------------------------------------------------------
def get_sheet_csv_url() -> str:
    cfg = (SITE / "js" / "config.js").read_text(encoding="utf-8")
    m = re.search(r'SHEET_CSV_URL\s*:\s*"([^"]+)"', cfg)
    if not m or not m.group(1):
        return ""
    return m.group(1)


# ----------------------------------------------------------------------
# 抓試算表 CSV → 商品資料 (dict by id)
# ----------------------------------------------------------------------
TRUTHY = {"1", "true", "yes", "y", "v", "✓", "勾", "勾選", "是", "有", "on"}


def truthy(v) -> bool:
    if v is None:
        return False
    return str(v).strip().lower() in TRUTHY


def num(v):
    if v is None or str(v).strip() == "":
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except Exception:
        return None


def fetch_sheet_rows(url: str):
    """從 published CSV URL 取得 (header_row_index_or_-1, list_of_dicts)。
    header 同時支援英文與中文欄位 (跟前端 HEADER_ALIASES 一致)。"""
    if not url:
        return []
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read().decode("utf-8")
    reader = csv.reader(io.StringIO(data))
    rows = list(reader)
    if not rows:
        return []
    header = [c.strip() for c in rows[0]]

    aliases = {
        "id": ["id", "post_id", "貼文id", "貼文編號", "編號"],
        "shortcode": ["shortcode", "post_shortcode"],
        "name": ["name", "title", "商品名稱", "藥品名稱", "名稱"],
        "keywords": ["keywords", "症狀", "症狀關鍵字", "搜尋關鍵字", "關鍵字"],
        "priceOriginal": ["priceOriginal", "原價", "定價"],
        "priceSale": ["priceSale", "特價", "售價"],
        "consult": ["consult", "consultPharmacist", "諮詢藥師", "請洽藥師", "不公開價格"],
        "hot": ["hot", "熱賣", "熱銷"],
        "soldOut": ["soldOut", "完售", "售完", "已售完"],
        "qty": ["qty", "quantity", "剩餘數量", "庫存", "數量"],
        "usage": ["usage", "適用性", "適用範圍", "適應症"],
        "hide": ["hide", "隱藏", "不顯示"],
        "image": ["image", "圖片", "圖片網址", "image_url"],
        "caption": ["caption", "_caption_預覽", "_caption", "說明", "IG說明"],
    }
    idx = {}
    for canon, names in aliases.items():
        for i, h in enumerate(header):
            if h.lower() in [n.lower() for n in names]:
                idx[canon] = i
                break

    out = []
    serial = 0
    for r in rows[1:]:
        def get(key):
            i = idx.get(key, -1)
            return (r[i] if i >= 0 and i < len(r) else "").strip()

        if not get("id"):
            continue
        serial += 1
        out.append({
            "id": get("id"),
            "serial": serial,
            "shortcode": get("shortcode"),
            "name": get("name"),
            "keywords": get("keywords"),
            "priceOriginal": num(get("priceOriginal")),
            "priceSale": num(get("priceSale")),
            "consult": truthy(get("consult")),
            "hot": truthy(get("hot")),
            "soldOut": truthy(get("soldOut")),
            "qty": num(get("qty")),
            "usage": get("usage"),
            "hide": truthy(get("hide")),
            "image": get("image"),
            "caption": get("caption"),
        })
    return out


def first_line(text: str) -> str:
    if not text:
        return ""
    for line in text.splitlines():
        line = line.strip()
        if line:
            return line
    return ""


def clean_caption(text: str) -> str:
    if not text:
        return ""
    return text.strip()


def extract_keywords(description: str, tags: list[str]) -> str:
    parts = []
    for t in tags or []:
        t = t.lstrip("#").strip()
        if t and not re.fullmatch(r"\d+", t):
            parts.append(t)
    return " ".join(parts)


def process():
    posts = {}  # keyed by post_id so multi-image posts collapse to one entry
    json_files = sorted(IG_DIR.glob("*.json"))
    for jf in json_files:
        try:
            meta = json.loads(jf.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"skip {jf.name}: {e}")
            continue

        post_id = str(meta.get("post_id") or meta.get("media_id") or "")
        shortcode = meta.get("post_shortcode") or meta.get("shortcode") or ""
        if not post_id:
            continue

        # Image filename = json filename minus .json suffix
        img_name = jf.name[:-5]  # strip ".json"
        img_path = IG_DIR / img_name
        if not img_path.exists():
            continue

        # Skip videos for now (we use the still cover only if no image exists)
        is_video = img_path.suffix.lower() in (".mp4", ".mov", ".webm")
        if is_video:
            continue

        post_url = meta.get("post_url") or (
            f"https://www.instagram.com/p/{shortcode}/" if shortcode else ""
        )

        description = clean_caption(meta.get("description", ""))
        tags = meta.get("tags") or []
        title = first_line(description)
        # Trim very long titles
        if len(title) > 60:
            title = title[:60].rstrip() + "…"

        # Copy image to site/images/  (keep post_id_<num>.jpg or post_id.jpg)
        out_name = img_name
        out_path = IMG_OUT / out_name
        if not out_path.exists() or out_path.stat().st_size != img_path.stat().st_size:
            shutil.copy2(img_path, out_path)

        entry = posts.setdefault(
            post_id,
            {
                "id": post_id,
                "shortcode": shortcode,
                "title": title,
                "caption": description,
                "tags": tags,
                "keywords": extract_keywords(description, tags),
                "date": meta.get("post_date", ""),
                "url": post_url,
                "images": [],
            },
        )
        entry["images"].append(f"images/{out_name}")

    # Sort newest first
    out = sorted(posts.values(), key=lambda p: p["date"], reverse=True)

    # ⚠️ 若沒有 ig_raw（例如 GitHub Actions 環境）→ 不要 overwrite，
    # 改讀現有 posts.json 當輸入。否則 IG 資料會被清空 → 前台空白。
    posts_json_path = DATA_OUT.joinpath("posts.json")
    if not out and posts_json_path.exists():
        try:
            existing = json.loads(posts_json_path.read_text(encoding="utf-8"))
            if isinstance(existing, list) and len(existing) > 0:
                print(f"⚠️  ig_raw/ 沒有資料，保留現有 posts.json ({len(existing)} 筆)")
                out = existing
        except Exception as e:
            print(f"無法讀現有 posts.json：{e}")
    else:
        posts_json_path.write_text(
            json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Wrote {len(out)} posts to data/posts.json")
        print(f"Copied images into {IMG_OUT}")

    # 合併 IG 文字資料 (posts.json) + 試算表動態資料 (價格、熱賣、隱藏...)
    sheet_rows = []
    sheet_url = get_sheet_csv_url()
    if sheet_url:
        try:
            sheet_rows = fetch_sheet_rows(sheet_url)
            print(f"Fetched {len(sheet_rows)} sheet rows")
        except Exception as e:
            print(f"⚠️  讀試算表失敗 ({e})，先用 IG 資料生 HTML")

    products = merge_products(out, sheet_rows)
    articles = load_articles()
    write_sitemap(products, articles)
    write_product_pages(products)   # 用合併後資料：含 soldOut/priceSale/usage/keywords
    write_article_pages(articles, products)
    write_articles_index(articles)
    inject_gallery(products)   # 再把 gallery + JSON 注入「index.html + 所有 product 頁」


def write_sitemap(posts, articles=None):
    """Generate site/sitemap.xml — homepage + every product page + every article."""
    today = ""
    try:
        from datetime import date
        today = date.today().isoformat()
    except Exception:
        pass

    def fmt_date(d: str) -> str:
        # posts.json date is "YYYY-MM-DD HH:MM:SS"; sitemap accepts ISO date
        if not d:
            return today
        return d.split(" ")[0]

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>',
        f'    <loc>{SITE_BASE_URL}/</loc>',
        f'    <lastmod>{today}</lastmod>',
        '    <changefreq>weekly</changefreq>',
        '    <priority>1.0</priority>',
        '  </url>',
    ]
    # Serial 用 item.serial（合併資料）；沒有 serial 的跳過
    written = 1  # homepage already counted
    for p in posts:
        serial = p.get("serial")
        if not serial:
            continue
        lastmod = fmt_date(p.get("date", ""))
        lines.extend([
            '  <url>',
            f'    <loc>{SITE_BASE_URL}/products/{serial}</loc>',
            f'    <lastmod>{lastmod}</lastmod>',
            '    <changefreq>monthly</changefreq>',
            '    <priority>0.8</priority>',
            '  </url>',
        ])
        written += 1
    # Articles listing + each article
    if articles:
        lines.extend([
            '  <url>',
            f'    <loc>{SITE_BASE_URL}/articles/</loc>',
            '    <changefreq>weekly</changefreq>',
            '    <priority>0.7</priority>',
            '  </url>',
        ])
        written += 1
        for a in articles:
            lines.extend([
                '  <url>',
                f'    <loc>{SITE_BASE_URL}/articles/{a["slug"]}/</loc>',
                f'    <lastmod>{a.get("date") or ""}</lastmod>',
                '    <changefreq>monthly</changefreq>',
                '    <priority>0.7</priority>',
                '  </url>',
            ])
            written += 1
    lines.append('</urlset>')
    SITE.joinpath("sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote sitemap.xml with {written} URLs")


def resolve_image_src(src: str) -> str:
    """images/xxx.jpg → /images/xxx.jpg；http(s) 開頭就原樣回傳。"""
    if not src:
        return ""
    if src.startswith("http://") or src.startswith("https://"):
        return src
    if src.startswith("/"):
        return src
    return "/" + src


def merge_products(posts, sheet_rows):
    """
    IG 貼文 + 試算表合併，產生最終 products list (display order)。
    """
    sheet_by_id = {r["id"]: r for r in sheet_rows}
    used_ids = set()
    merged = []

    for p in posts:
        s = sheet_by_id.get(p["id"])
        if s:
            used_ids.add(s["id"])
        merged.append({
            "id": p["id"],
            "serial": s["serial"] if s else None,
            "shortcode": p.get("shortcode") or (s.get("shortcode") if s else ""),
            "title": (s["name"] if (s and s.get("name")) else p.get("title")) or "(未命名商品)",
            "caption": p.get("caption", ""),
            "keywords": (s.get("keywords") if s else "") or p.get("keywords", ""),
            "priceOriginal": s.get("priceOriginal") if s else None,
            "priceSale": s.get("priceSale") if s else None,
            "consult": bool(s.get("consult")) if s else False,
            "hot": bool(s.get("hot")) if s else False,
            "soldOut": bool(s.get("soldOut")) if s else False,
            "qty": s.get("qty") if s else None,
            "usage": (s.get("usage") if s else "") or "",
            "hide": bool(s.get("hide")) if s else False,
            "url": p.get("url", ""),
            "images": [(s["image"] if (s and s.get("image")) else (p["images"][0] if p.get("images") else ""))],
        })

    # 純試算表新增（不在 posts.json 但有 image）
    for s in sheet_rows:
        if s["id"] in used_ids:
            continue
        if not s.get("image"):
            continue
        merged.insert(0, {
            "id": s["id"],
            "serial": s["serial"],
            "shortcode": s.get("shortcode", ""),
            "title": s.get("name") or "(未命名商品)",
            "caption": s.get("caption", "") or "",
            "keywords": s.get("keywords", ""),
            "priceOriginal": s.get("priceOriginal"),
            "priceSale": s.get("priceSale"),
            "consult": s.get("consult", False),
            "hot": s.get("hot", False),
            "soldOut": s.get("soldOut", False),
            "qty": s.get("qty"),
            "usage": s.get("usage", ""),
            "hide": s.get("hide", False),
            "url": "",
            "images": [s["image"]],
        })

    return merged


def render_card_html(item: dict) -> str:
    """生成單一商品卡片 HTML（與 app.js renderCard 結構一致）。"""
    cover = resolve_image_src(item["images"][0] if item.get("images") else "")
    is_sold = item.get("soldOut")
    classes = "card" + (" is-sold" if is_sold else "")
    title = item.get("title") or ""
    usage = item.get("usage") or ""

    # 印章 / 跑馬燈
    if is_sold:
        overlay = '<div class="stamps"><div class="stamp is-sold">完售</div></div>'
    elif item.get("hot"):
        seg = "熱賣中　・　" * 8
        overlay = (
            '<div class="hot-marquee" aria-label="熱賣中">'
            f'<div class="hot-marquee-track"><span>{seg}</span><span>{seg}</span></div>'
            "</div>"
        )
    else:
        overlay = ""

    # 價格
    has = lambda v: v is not None
    fmt = lambda v: f"{int(v):,}" if v == int(v) else f"{v:,}"
    if item.get("consult"):
        price_html = '<span class="price-consult">諮詢藥師</span>'
    elif has(item.get("priceSale")) and has(item.get("priceOriginal")) and item["priceSale"] < item["priceOriginal"]:
        price_html = (
            f'<span class="price"><span class="price-sale">{fmt(item["priceSale"])}</span>'
            f'<span class="price-original">{fmt(item["priceOriginal"])}</span></span>'
        )
    elif has(item.get("priceSale")):
        price_html = f'<span class="price"><span class="price-only">{fmt(item["priceSale"])}</span></span>'
    elif has(item.get("priceOriginal")):
        price_html = f'<span class="price"><span class="price-only">{fmt(item["priceOriginal"])}</span></span>'
    else:
        price_html = ""

    # 數量
    q = item.get("qty")
    qty_html = ""
    if q is not None and q > 0:
        low = " is-low" if q <= 5 else ""
        qty_html = f'<span class="qty{low}">剩 {int(q)} 件</span>'

    serial = item.get("serial")
    data_serial = f' data-serial="{serial}"' if serial else ""
    data_id = f' data-id="{html_escape(str(item.get("id") or ""))}"'

    usage_html = ""
    if usage:
        usage_html = f'<div class="card-usage">{html_escape(usage)}</div>'

    return (
        f'<article class="{classes}"{data_id}{data_serial}>'
        '<div class="card-image-wrap">'
        f'<img loading="lazy" width="1080" height="1080" src="{html_escape(cover)}" alt="{html_escape(title)}" />'
        f'{overlay}'
        '</div>'
        '<div class="card-body">'
        f'<h3 class="card-title">{html_escape(title)}</h3>'
        f'{usage_html}'
        f'<div class="card-meta">{price_html}{qty_html}</div>'
        '</div>'
        '</article>'
    )


def inject_gallery(products):
    """把預先渲染的商品卡片 + 完整商品 JSON 寫進首頁、所有產品頁的標記內。"""
    visible = [p for p in products if not p.get("hide")]
    gallery_html = '<div id="gallery" class="gallery">'
    if visible:
        gallery_html += "\n" + "\n".join(render_card_html(p) for p in visible) + "\n"
    gallery_html += "</div>"

    # JSON 給 app.js 讀（modal/搜尋用）
    products_json = json.dumps(visible, ensure_ascii=False)
    products_data_html = f'<script id="productsData" type="application/json">{products_json}</script>'

    files = [SITE / "index.html"]
    products_dir = SITE / "products"
    if products_dir.exists():
        for sub in products_dir.iterdir():
            if sub.is_dir():
                f = sub / "index.html"
                if f.exists():
                    files.append(f)

    for path in files:
        html = path.read_text(encoding="utf-8")
        html = re.sub(
            r"<!-- gallery:start -->.*?<!-- gallery:end -->",
            f"<!-- gallery:start -->{gallery_html}<!-- gallery:end -->",
            html,
            flags=re.DOTALL,
            count=1,
        )
        html = re.sub(
            r"<!-- products-data:start -->.*?<!-- products-data:end -->",
            f"<!-- products-data:start -->\n{products_data_html}\n<!-- products-data:end -->",
            html,
            flags=re.DOTALL,
            count=1,
        )
        path.write_text(html, encoding="utf-8")

    print(f"Injected gallery ({len(visible)} cards) into {len(files)} HTML file(s)")


def html_escape(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def build_seo_title(title_raw: str) -> str:
    """商品頁 <title>：含品名 + 在地後綴，控制在 ~60 字內。"""
    suffix = "｜台中北屯惠登藥局・藥師諮詢"
    # 60 字內：suffix ≈ 15 字，給品名留 ~45
    max_name = 60 - len(suffix)
    name = title_raw if len(title_raw) <= max_name else title_raw[:max_name].rstrip() + "…"
    return f"{name}{suffix}"


def build_seo_description(p: dict, title_raw: str) -> str:
    """商品頁 description：開頭強調地點 + 商品名 + 適用症狀，控制在 ~155 字內。"""
    prefix = f"【台中北屯藥局・惠登】{title_raw}"
    usage = (p.get("usage") or "").strip()
    keywords = (p.get("keywords") or "").strip()
    caption = " ".join((p.get("caption") or "").split())

    parts = [prefix]
    if usage:
        parts.append(f"適用：{usage}")
    elif caption:
        # 取 caption 前 80 字當摘要
        parts.append(caption[:80])
    if keywords:
        parts.append(f"關鍵字：{keywords}")
    parts.append("藥師一對一諮詢 (04)2422-5682")

    desc = " ・ ".join(parts)
    if len(desc) > 155:
        desc = desc[:155].rstrip("・ ") + "…"
    return desc


def build_product_jsonld(p: dict, title_raw: str, image_url: str, product_url: str) -> str:
    """產生 Product schema JSON-LD 字串（含 script 標籤）。

    Google Rich Results 規則：
      - 若有 offers，price + priceCurrency 必填
      - 諮詢藥師 / 沒填價的商品 → 不放 offers，避免被判 invalid
    """
    data = {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": f"{product_url}#product",
        "name": title_raw,
        "image": image_url,
        "url": product_url,
        "brand": {"@type": "Brand", "name": "惠登藥局 Wheadon Pharmacy"},
        "category": "Pharmacy/Health",
    }
    # description：用較長版本（300 字內）
    caption = " ".join((p.get("caption") or "").split())
    if caption:
        data["description"] = caption[:300]
    elif p.get("usage"):
        data["description"] = p["usage"]

    # 只在「有公開價格」時才產生 offers
    price_raw = p.get("priceSale") or p.get("priceOriginal")
    price_value = None
    if price_raw is not None:
        try:
            price_value = str(int(float(price_raw)))
        except (TypeError, ValueError):
            price_value = None

    if price_value is not None:
        data["offers"] = {
            "@type": "Offer",
            "url": product_url,
            "priceCurrency": "TWD",
            "price": price_value,
            "availability": (
                "https://schema.org/OutOfStock"
                if p.get("soldOut")
                else "https://schema.org/InStock"
            ),
            "seller": {"@id": f"{SITE_BASE_URL}/#pharmacy"},
            "areaServed": "TW",
        }
    # 沒價格但完售：放在 description 結尾標註，不放 offers
    elif p.get("soldOut"):
        if "description" in data:
            data["description"] = data["description"] + "（目前完售）"
        else:
            data["description"] = "目前完售"

    return (
        '<script type="application/ld+json">\n'
        + json.dumps(data, ensure_ascii=False, indent=2)
        + "\n</script>"
    )


def write_product_pages(posts):
    """
    為每個商品產生 /products/{serial}/index.html，含獨立的 OG meta + Product schema。
    社群分享預覽 (LINE/FB/Telegram) 就會看到對的圖跟標題。

    流水號 = 在前端顯示順序 (newest first)，從 1 開始。
    """
    import re

    template_path = SITE / "index.html"
    template = template_path.read_text(encoding="utf-8")

    products_root = SITE / "products"
    products_root.mkdir(parents=True, exist_ok=True)

    # 標記目前要生成的 serial，最後再清掉多餘的
    keep_serials = set()

    for p in posts:
        serial = p.get("serial")
        if not serial:
            # 沒有 serial 的商品（IG 抓到但試算表還沒填）跳過，避免位置錯亂
            continue
        title_raw = (p.get("title") or "未命名商品").strip()
        page_title = build_seo_title(title_raw)
        description = build_seo_description(p, title_raw)
        first_image = (p.get("images") or [None])[0] or "banner.png"
        image_url = f"{SITE_BASE_URL}/{first_image.lstrip('/')}"
        product_url = f"{SITE_BASE_URL}/products/{serial}"

        # OG / Twitter 用較短的版本（社群預覽喜歡 ~120 字）
        og_desc = description if len(description) <= 120 else description[:120] + "…"

        html = template

        # <title>
        html = re.sub(
            r"<title>[^<]*</title>",
            f"<title>{html_escape(page_title)}</title>",
            html, count=1,
        )

        # 各種 meta — 用屬性 (property=/name=) 跟 content= 抓
        def replace_meta(html_in, attr_name, attr_value, new_content):
            pattern = rf'<meta\s+{attr_name}=["\']{re.escape(attr_value)}["\']\s+content=["\'][^"\']*["\']\s*/?>'
            replacement = f'<meta {attr_name}="{attr_value}" content="{html_escape(new_content)}" />'
            return re.sub(pattern, replacement, html_in, count=1)

        html = replace_meta(html, "name", "description", description)
        html = replace_meta(html, "property", "og:title", page_title)
        html = replace_meta(html, "property", "og:description", og_desc)
        html = replace_meta(html, "property", "og:image", image_url)
        html = replace_meta(html, "property", "og:url", product_url)
        html = replace_meta(html, "name", "twitter:title", page_title)
        html = replace_meta(html, "name", "twitter:description", og_desc)
        html = replace_meta(html, "name", "twitter:image", image_url)

        # canonical
        html = re.sub(
            r'<link\s+rel=["\']canonical["\']\s+href=["\'][^"\']*["\']\s*/?>',
            f'<link rel="canonical" href="{product_url}" />',
            html, count=1,
        )

        # og:image:width/height 動態移除（不同產品圖大小不同，留著怕誤導爬蟲）
        html = re.sub(
            r'\s*<meta\s+property=["\']og:image:(width|height)["\']\s+content=["\'][^"\']*["\']\s*/?>',
            "",
            html,
        )

        # 注入 Product schema（在 </head> 前）
        product_jsonld = build_product_jsonld(p, title_raw, image_url, product_url)
        html = html.replace(
            "</head>",
            f"\n<!-- Product schema (auto-generated) -->\n{product_jsonld}\n</head>",
            1,
        )

        # 寫進 /products/{N}/index.html
        prod_dir = products_root / str(serial)
        prod_dir.mkdir(parents=True, exist_ok=True)
        prod_dir.joinpath("index.html").write_text(html, encoding="utf-8")
        keep_serials.add(str(serial))

    # 清掉多餘的舊 serial 資料夾（嘗試但失敗不擋）
    for sub in products_root.iterdir():
        if sub.is_dir() and sub.name.isdigit() and sub.name not in keep_serials:
            try:
                for f in sub.iterdir():
                    f.unlink()
                sub.rmdir()
            except Exception as e:
                print(f"  ⚠️ 無法清掉舊資料夾 {sub.name}: {e}")

    print(f"Generated {len(posts)} product pages in {products_root}")


# ============================================================
# Articles (文章 / 衛教專欄)
# ============================================================
ARTICLES_DIR = ROOT / "articles"
ARTICLES_OUT = SITE / "articles"


def load_articles():
    """讀 articles/*.html，每個檔頭 <!--meta ... --> 區塊就是 frontmatter。"""
    if not ARTICLES_DIR.exists():
        return []
    articles = []
    for path in sorted(ARTICLES_DIR.glob("*.html")):
        text = path.read_text(encoding="utf-8")
        m = re.match(r"\s*<!--meta\s*\n(.*?)\n-->\s*", text, re.S)
        if not m:
            print(f"  ⚠️ {path.name}：找不到 <!--meta ... --> 區塊，略過")
            continue
        meta = {}
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        body = text[m.end():].strip()
        # 拆出 <article-body>...</article-body>
        bm = re.search(r"<article-body>(.*)</article-body>", body, re.S)
        if bm:
            body = bm.group(1).strip()
        meta["slug"] = path.stem
        meta["body"] = body
        meta["source_path"] = str(path)
        articles.append(meta)
    # 依日期降序排，最新在前
    articles.sort(key=lambda a: a.get("date", ""), reverse=True)
    return articles


def extract_faq_pairs(body: str):
    """從 <dl class="faq"> ... </dl> 抓出 dt/dd pairs，給 FAQPage schema 用。"""
    dl_match = re.search(r'<dl class="faq">(.*?)</dl>', body, re.S)
    if not dl_match:
        return []
    block = dl_match.group(1)
    pairs = []
    # 簡單 parser：交替抓 <dt>...</dt><dd>...</dd>
    pattern = re.compile(r"<dt>(.*?)</dt>\s*<dd>(.*?)</dd>", re.S)
    for q, a in pattern.findall(block):
        # 去掉內部 HTML tag 簡化
        q_text = re.sub(r"<[^>]+>", "", q).strip()
        a_text = re.sub(r"<[^>]+>", "", a).strip()
        if q_text and a_text:
            pairs.append((q_text, a_text))
    return pairs


def build_article_jsonld(meta: dict, article_url: str, image_url: str):
    """產生 Article + FAQPage (如果有 FAQ) 兩個 JSON-LD。"""
    article_data = {
        "@context": "https://schema.org",
        "@type": "Article",
        "@id": f"{article_url}#article",
        "headline": meta.get("title", ""),
        "description": meta.get("description", ""),
        "image": image_url,
        "url": article_url,
        "datePublished": meta.get("date", ""),
        "dateModified": meta.get("date", ""),
        "inLanguage": "zh-Hant-TW",
        "author": {
            "@type": "Organization",
            "name": "惠登藥局 Wheadon Pharmacy",
            "url": SITE_BASE_URL,
        },
        "publisher": {
            "@type": "Organization",
            "name": "惠登藥局 Wheadon Pharmacy",
            "logo": {
                "@type": "ImageObject",
                "url": f"{SITE_BASE_URL}/favicon.png",
            },
        },
        "mainEntityOfPage": article_url,
    }
    if meta.get("keywords"):
        article_data["keywords"] = meta["keywords"]

    blocks = [
        '<script type="application/ld+json">\n'
        + json.dumps(article_data, ensure_ascii=False, indent=2)
        + "\n</script>"
    ]

    faqs = extract_faq_pairs(meta.get("body", ""))
    if faqs:
        faq_data = {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {"@type": "Answer", "text": a},
                }
                for q, a in faqs
            ],
        }
        blocks.append(
            '<script type="application/ld+json">\n'
            + json.dumps(faq_data, ensure_ascii=False, indent=2)
            + "\n</script>"
        )

    return "\n".join(blocks)


def build_related_products_html(meta: dict, products: list) -> str:
    """frontmatter 的 related_products: 18,16,3 → 3 個商品卡 HTML。"""
    raw = meta.get("related_products", "")
    if not raw:
        return ""
    serials = []
    for s in raw.split(","):
        s = s.strip()
        if s.isdigit():
            serials.append(int(s))
    if not serials:
        return ""
    by_serial = {p["serial"]: p for p in products if p.get("serial")}
    items = []
    for sn in serials:
        p = by_serial.get(sn)
        if not p:
            continue
        title = (p.get("title") or "").strip()
        cover = (p.get("images") or [""])[0]
        cover_src = resolve_image_src(cover) if cover else ""
        items.append(
            f'<a class="related-product" href="/products/{sn}/">'
            + (f'<img loading="lazy" src="{html_escape(cover_src)}" alt="{html_escape(title)}" width="200" height="200">' if cover_src else "")
            + f'<span class="related-product-title">{html_escape(title)}</span>'
            + "</a>"
        )
    if not items:
        return ""
    return (
        '<section class="related-section" aria-labelledby="related-title">'
        '<h2 id="related-title">相關商品</h2>'
        '<div class="related-grid">'
        + "".join(items)
        + "</div></section>"
    )


def build_article_main_html(meta: dict, products: list) -> str:
    """組出 <main> 內部 HTML（替換掉首頁的 main 內容）。"""
    title = html_escape(meta.get("title", ""))
    date = meta.get("date", "")
    body = meta.get("body", "")
    related = build_related_products_html(meta, products)
    return f'''<main class="site-main article-main">
  <article class="article">
    <header class="article-header">
      <p class="article-breadcrumb"><a href="/">首頁</a> ・ <a href="/articles/">文章</a></p>
      <h1 class="article-title">{title}</h1>
      <p class="article-meta"><time datetime="{html_escape(date)}">{html_escape(date)}</time> ・ 惠登藥局 北屯昌平路</p>
    </header>
    <div class="article-body">
{body}
    </div>
    <footer class="article-footer">
      <p class="article-cta-row">
        <a class="bundle-cta" href="https://lin.ee/Zcku5o0" target="_blank" rel="noopener">LINE 問藥師</a>
        <a class="bundle-cta secondary" href="tel:+886424225682">來電 (04) 2422-5682</a>
        <a class="bundle-cta secondary" href="/articles/">看其他文章 →</a>
      </p>
    </footer>
  </article>
  {related}
</main>'''


def write_article_pages(articles, products):
    """為每篇文章生成 /articles/{slug}/index.html。"""
    if not articles:
        return
    template = (SITE / "index.html").read_text(encoding="utf-8")
    ARTICLES_OUT.mkdir(parents=True, exist_ok=True)
    keep = set()

    for a in articles:
        slug = a["slug"]
        title = a.get("title", "")
        description = a.get("description", "")
        date = a.get("date", "")
        cover = a.get("cover_image", "/banner.png")
        if cover.startswith("/"):
            image_url = f"{SITE_BASE_URL}{cover}"
        elif cover.startswith("http"):
            image_url = cover
        else:
            image_url = f"{SITE_BASE_URL}/{cover}"
        article_url = f"{SITE_BASE_URL}/articles/{slug}/"

        html = template

        # <title>
        page_title = f"{title}｜惠登藥局 北屯昌平路"
        if len(page_title) > 70:
            page_title = title
        html = re.sub(r"<title>[^<]*</title>", f"<title>{html_escape(page_title)}</title>", html, count=1)

        # meta 替換（沿用 write_product_pages 的 helper 邏輯）
        def replace_meta(html_in, attr_name, attr_value, new_content):
            pattern = rf'<meta\s+{attr_name}=["\']{re.escape(attr_value)}["\']\s+content=["\'][^"\']*["\']\s*/?>'
            replacement = f'<meta {attr_name}="{attr_value}" content="{html_escape(new_content)}" />'
            return re.sub(pattern, replacement, html_in, count=1)

        html = replace_meta(html, "name", "description", description)
        if a.get("keywords"):
            html = replace_meta(html, "name", "keywords", a["keywords"])
        html = replace_meta(html, "property", "og:title", page_title)
        html = replace_meta(html, "property", "og:description", description)
        html = replace_meta(html, "property", "og:image", image_url)
        html = replace_meta(html, "property", "og:url", article_url)
        html = replace_meta(html, "name", "twitter:title", page_title)
        html = replace_meta(html, "name", "twitter:description", description)
        html = replace_meta(html, "name", "twitter:image", image_url)

        # canonical
        html = re.sub(
            r'<link\s+rel=["\']canonical["\']\s+href=["\'][^"\']*["\']\s*/?>',
            f'<link rel="canonical" href="{article_url}" />',
            html, count=1,
        )

        # og:image:width/height 砍掉（用 banner 預設值會誤導）
        html = re.sub(
            r'\s*<meta\s+property=["\']og:image:(width|height)["\']\s+content=["\'][^"\']*["\']\s*/?>',
            "",
            html,
        )

        # 把整個 <main>...</main> 換成文章內容
        new_main = build_article_main_html(a, products)
        html = re.sub(r'<main class="site-main">.*?</main>', new_main, html, count=1, flags=re.S)

        # 注入 Article + FAQ schema
        a_jsonld = build_article_jsonld(a, article_url, image_url)
        html = html.replace(
            "</head>",
            f"\n<!-- Article schema (auto-generated) -->\n{a_jsonld}\n</head>",
            1,
        )

        out_dir = ARTICLES_OUT / slug
        out_dir.mkdir(parents=True, exist_ok=True)
        out_dir.joinpath("index.html").write_text(html, encoding="utf-8")
        keep.add(slug)

    # 清掉舊文章資料夾
    for sub in ARTICLES_OUT.iterdir():
        if sub.is_dir() and sub.name not in keep and sub.name not in {"_assets"}:
            try:
                for f in sub.iterdir():
                    f.unlink()
                sub.rmdir()
            except Exception as e:
                print(f"  ⚠️ 無法清掉舊文章 {sub.name}: {e}")

    print(f"Generated {len(articles)} article pages in {ARTICLES_OUT}")


def write_articles_index(articles):
    """生成 /articles/index.html 文章列表頁。"""
    if not articles:
        return
    template = (SITE / "index.html").read_text(encoding="utf-8")

    title = "健康知識｜惠登藥局衛教專欄"
    description = "惠登藥局衛教專欄：北屯昌平路藥局推薦、慢性病用藥、中西藥併用、保健食品等藥師專業文章。"
    url = f"{SITE_BASE_URL}/articles/"
    image_url = f"{SITE_BASE_URL}/banner.png"

    html = template
    html = re.sub(r"<title>[^<]*</title>", f"<title>{html_escape(title)}</title>", html, count=1)

    def replace_meta(html_in, attr_name, attr_value, new_content):
        pattern = rf'<meta\s+{attr_name}=["\']{re.escape(attr_value)}["\']\s+content=["\'][^"\']*["\']\s*/?>'
        replacement = f'<meta {attr_name}="{attr_value}" content="{html_escape(new_content)}" />'
        return re.sub(pattern, replacement, html_in, count=1)

    html = replace_meta(html, "name", "description", description)
    html = replace_meta(html, "property", "og:title", title)
    html = replace_meta(html, "property", "og:description", description)
    html = replace_meta(html, "property", "og:url", url)
    html = replace_meta(html, "name", "twitter:title", title)
    html = replace_meta(html, "name", "twitter:description", description)
    html = re.sub(
        r'<link\s+rel=["\']canonical["\']\s+href=["\'][^"\']*["\']\s*/?>',
        f'<link rel="canonical" href="{url}" />',
        html, count=1,
    )

    # 文章列表 HTML
    items = []
    for a in articles:
        slug = a["slug"]
        t = html_escape(a.get("title", ""))
        d = html_escape(a.get("date", ""))
        desc = html_escape(a.get("description", ""))
        items.append(
            f'<article class="article-card">'
            f'  <h2 class="article-card-title"><a href="/articles/{slug}/">{t}</a></h2>'
            f'  <p class="article-card-meta"><time datetime="{d}">{d}</time></p>'
            f'  <p class="article-card-excerpt">{desc}</p>'
            f'  <p><a class="article-card-link" href="/articles/{slug}/">繼續閱讀 →</a></p>'
            f'</article>'
        )
    new_main = f'''<main class="site-main articles-main">
  <header class="articles-header">
    <p class="article-breadcrumb"><a href="/">首頁</a> ・ 文章</p>
    <h1>健康知識・衛教專欄</h1>
    <p class="section-sub">藥師親寫，給北屯昌平路一帶住戶的用藥與保健資訊。</p>
  </header>
  <div class="articles-list">
    {"".join(items)}
  </div>
</main>'''
    html = re.sub(r'<main class="site-main">.*?</main>', new_main, html, count=1, flags=re.S)

    out_path = ARTICLES_OUT / "index.html"
    out_path.write_text(html, encoding="utf-8")
    print(f"Generated articles index at {out_path}")


if __name__ == "__main__":
    process()
