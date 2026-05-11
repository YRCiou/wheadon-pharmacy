"""
Read gallery-dl output in ig_raw/, build site/data/posts.json,
and copy/symlink images into site/images/.

Run:
  python build_data.py
"""

import json
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
IG_DIR = ROOT / "ig_raw" / "instagram" / "wheadonpharmacy"
SITE = ROOT / "site"
IMG_OUT = SITE / "images"
DATA_OUT = SITE / "data"

SITE_BASE_URL = "https://wheadon-pharmacy.pages.dev"

IMG_OUT.mkdir(parents=True, exist_ok=True)
DATA_OUT.mkdir(parents=True, exist_ok=True)


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
    DATA_OUT.joinpath("posts.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {len(out)} posts to data/posts.json")
    print(f"Copied images into {IMG_OUT}")

    write_sitemap(out)
    write_product_pages(out)


def write_sitemap(posts):
    """Generate site/sitemap.xml — homepage + every product page (/products/{serial})."""
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
    # Serial numbering matches frontend: posts ordered by date desc -> serial 1..N
    for serial, p in enumerate(posts, start=1):
        lastmod = fmt_date(p.get("date", ""))
        lines.extend([
            '  <url>',
            f'    <loc>{SITE_BASE_URL}/products/{serial}</loc>',
            f'    <lastmod>{lastmod}</lastmod>',
            '    <changefreq>monthly</changefreq>',
            '    <priority>0.8</priority>',
            '  </url>',
        ])
    lines.append('</urlset>')
    SITE.joinpath("sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote sitemap.xml with {len(posts) + 1} URLs")


def html_escape(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def write_product_pages(posts):
    """
    為每個商品產生 /products/{serial}/index.html，含獨立的 OG meta。
    社群分享預覽 (LINE/FB/Telegram) 就會看到對的圖跟標題。

    流水號 = 在前端顯示順序 (newest first)，從 1 開始。
    """
    import re

    template_path = SITE / "index.html"
    template = template_path.read_text(encoding="utf-8")

    products_root = SITE / "products"
    products_root.mkdir(parents=True, exist_ok=True)

    # 清掉舊的 (避免有殘留的 serial 過期頁面)
    for sub in products_root.iterdir():
        if sub.is_dir() and sub.name.isdigit():
            for f in sub.iterdir():
                f.unlink()
            sub.rmdir()

    for serial, p in enumerate(posts, start=1):
        title_raw = (p.get("title") or "未命名商品").strip()
        page_title = f"{title_raw}｜惠登藥局 Wheadon Pharmacy"
        caption = " ".join((p.get("caption") or "").split())
        if len(caption) > 160:
            caption = caption[:160] + "…"
        if not caption:
            caption = "惠登藥局商品"
        first_image = (p.get("images") or [None])[0] or "banner.png"
        image_url = f"{SITE_BASE_URL}/{first_image.lstrip('/')}"
        product_url = f"{SITE_BASE_URL}/products/{serial}"

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

        html = replace_meta(html, "name", "description", caption)
        html = replace_meta(html, "property", "og:title", page_title)
        html = replace_meta(html, "property", "og:description", caption)
        html = replace_meta(html, "property", "og:image", image_url)
        html = replace_meta(html, "property", "og:url", product_url)
        html = replace_meta(html, "name", "twitter:title", page_title)
        html = replace_meta(html, "name", "twitter:description", caption)
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

        # 寫進 /products/{N}/index.html
        prod_dir = products_root / str(serial)
        prod_dir.mkdir(parents=True, exist_ok=True)
        prod_dir.joinpath("index.html").write_text(html, encoding="utf-8")

    print(f"Generated {len(posts)} product pages in {products_root}")


if __name__ == "__main__":
    process()
