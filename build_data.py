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


if __name__ == "__main__":
    process()
