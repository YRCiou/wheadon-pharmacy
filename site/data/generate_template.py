"""
從 site/data/posts.json 產生一份對應每筆 IG 貼文的空白模板 CSV，
可直接匯入 Google 試算表後填入價格、適用性…等。

執行：
  python site/data/generate_template.py
產生： site/data/template_full.csv
"""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).parent
posts = json.loads((ROOT / "posts.json").read_text(encoding="utf-8"))

HEADER = [
    "id",
    "shortcode",
    "商品名稱",
    "症狀關鍵字",
    "原價",
    "特價",
    "諮詢藥師",
    "熱賣",
    "完售",
    "剩餘數量",
    "適用性",
    "隱藏",
    "_caption_預覽",
]

out_path = ROOT / "template_full.csv"
with out_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(HEADER)
    for p in posts:
        cap = (p.get("caption") or "").splitlines()
        first = cap[0] if cap else ""
        w.writerow(
            [
                p["id"],
                p.get("shortcode", ""),
                p.get("title", ""),
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                first,
            ]
        )

print(f"OK → {out_path}  ({len(posts)} rows)")
