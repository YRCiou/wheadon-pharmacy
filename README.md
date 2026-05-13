# 惠登藥局 商品查詢網站

把 IG @wheadonpharmacy 的所有貼文圖片變成可搜尋的商品目錄，
價格 / 適用性 / 熱賣 / 完售 等欄位由你自己維護的 **Google 試算表** 控制。

---

## ★ 對未來 AI / Claude 的指示

**任何 SEO 檢查、Meta 改寫、新文章生成、競爭對手分析之前，先讀以下檔案：**

1. [`docs/SEO_CONTEXT.md`](docs/SEO_CONTEXT.md) — 網站背景、服務、用戶、技術現況（單一資料來源）
2. [`docs/SEO_STRATEGY.md`](docs/SEO_STRATEGY.md) — 地點 × 緊急服務 × 服務組合 的整合策略
3. [`docs/SEO_NEW_ARTICLE_CHECKLIST.md`](docs/SEO_NEW_ARTICLE_CHECKLIST.md) — 每篇新文章必跑的 SOP
4. [`docs/competitors/`](docs/competitors/) — 大樹 / 瑞昌 / 全成 對手檔

此網站專案**僅描述惠登藥局**，請勿與其他 InnovaRad 客戶資料混雜。

```
99_wheadon.pharmacy/
├─ ig_raw/                   # gallery-dl 抓下來的原始 IG 圖 + metadata
├─ build_data.py             # 把 ig_raw 處理成 site/data/posts.json
├─ site/                     # ★ 部署這個資料夾就是網站
│  ├─ index.html
│  ├─ css/style.css
│  ├─ js/config.js           # ← 把 Google 試算表網址填到這裡
│  ├─ js/app.js
│  ├─ images/                # 商品圖
│  └─ data/
│     ├─ posts.json          # 自動產生：IG 圖片 + 文字
│     ├─ template_full.csv   # 把這個匯入 Google 試算表後填寫
│     └─ generate_template.py
```

---

## 一、本機預覽

```
cd site
python -m http.server 8000
```
打開 <http://localhost:8000>

> 直接 `file://` 雙擊 `index.html` 不行，因為瀏覽器會擋 `fetch()`，
> 一定要用 HTTP Server。

---

## 二、Google 試算表設定（重點）

### 1. 建表
1. 開新的 Google 試算表
2. 把 `site/data/template_full.csv` 內容貼進去（檔案 → 匯入 → 上傳）
3. 第一列就是欄位名稱，請保持原樣

### 2. 欄位說明

| 欄位 | 說明 |
|---|---|
| `id` | **必填**。IG 貼文編號，會自動和對應的圖片 / 描述配對。請勿改。 |
| `shortcode` | IG 短碼（自動帶入，僅供參考） |
| `商品名稱` | 顯示在卡片上的標題（沒填就用 IG 描述第一行） |
| `症狀關鍵字` | 用空白分隔的關鍵字，搜尋會比對這欄。例：`頭痛 感冒 退燒` |
| `原價` | 數字。會顯示為刪除線。 |
| `特價` | 數字。比原價低時會以紅色顯示，原價變刪除線。 |
| `諮詢藥師` | `TRUE` 或留白。勾選後**不顯示價格**，改顯示「諮詢藥師」標籤。 |
| `熱賣` | `TRUE` 或留白。勾選後圖片上會蓋上紅色「熱賣」印章。 |
| `完售` | `TRUE` 或留白。勾選後蓋上「完售」印章 + 圖片變灰。**完售優先於熱賣**。 |
| `剩餘數量` | 數字。打 0 或留白就**不會顯示這個欄位**。 |
| `適用性` | 自由填寫，會顯示在卡片和詳細視窗中。 |
| `隱藏` | `TRUE` 表示完全不顯示這個商品。 |
| `_caption_預覽` | 僅供你對照 IG 文字使用，網站不會讀取 |

> 勾選欄位填什麼都行：`TRUE` / `1` / `是` / `勾` / `Y` 都會被當成「有勾」。

### 3. 發布為 CSV
1. 檔案 → 共用 → **發布到網路** (Publish to web)
2. 「連結」→ 選擇要發布的工作表 + **CSV 格式**
3. 點「發布」，複製網址

### 4. 把網址填進去
編輯 `site/js/config.js`：
```js
window.SITE_CONFIG = {
  SHEET_CSV_URL: "貼這裡的網址",
  ...
};
```
存檔、重新整理網頁就讀進來了。

---

## 三、IG 貼文有更新時

```
# 重新抓 IG (gallery-dl 會跳過已下載的)
python -m gallery_dl --write-metadata https://www.instagram.com/wheadonpharmacy/ -d ig_raw

# 重新產生 posts.json + 複製新圖
python build_data.py

# 重新產生空白模板
python site/data/generate_template.py
```
新貼文會出現在 `template_full.csv`，把新的 row 補進你的 Google 試算表即可。

---

## 四、部署
`site/` 是純靜態網站，可以丟到：
- GitHub Pages
- Cloudflare Pages
- Netlify
- 任何虛擬主機

只要把整個 `site/` 上傳即可。
