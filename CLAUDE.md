# Claude 工作指南（惠登藥局 only）

此檔由 Claude Code 自動讀取。**只描述此單一專案**（惠登藥局），不可與其他客戶資料混雜。

## SEO / 內容工作前的必讀順序

1. `docs/SEO_CONTEXT.md` — 網站背景、服務、用戶、技術現況
2. `docs/SEO_STRATEGY.md` — 地點 × 緊急服務 × 服務組合 整合策略
3. `docs/SEO_NEW_ARTICLE_CHECKLIST.md` — 每篇新文章 SOP
4. `docs/competitors/{greattree,richpharmacy,ccdrugstore}.md` — 對手檔

完工後，把新發現（關鍵字、排名變動、競爭對手新動作）寫回對應 MD 的「最近更新」段落。

## 常用指令

- 本機預覽：`cd site && python -m http.server 8000`
- 重新建構：`python build_data.py`（會更新 gallery、product pages、sitemap）
- 部署：commit + push 後 Cloudflare Pages 自動部署

## 技術棧速查

| 元件 | 位置 |
|---|---|
| 前台 | `site/index.html` + `site/css/style.css` + `site/js/app.js` |
| 後台 | `site/ruthie/` |
| 後端 | `apps_script/Code.gs`（Google Apps Script Web App） |
| 建構 | `build_data.py`（GitHub Actions `republish.yml` 也跑這支） |
| 商品頁 | `site/products/{N}/index.html`（由 `build_data.py` 生成） |
| 追蹤 | GTM `GTM-PFVCRJ2V`、Microsoft Clarity `wpsvug3h7h` |
