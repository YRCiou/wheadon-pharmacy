# 文章來源

每篇文章 = 一個 `articles/{slug}.html` 檔。
`{slug}` 會變成 URL：`/articles/{slug}/`，務必用英文小寫 + 連字號。

## 檔案格式

```html
<!--meta
title: 文章標題（要進 <title> 與 og:title）
description: 摘要（80~155 字、要進 description 與 og:description）
date: 2026-05-12
keywords: 逗號分隔, 不超過 10 個
cover_image: /banner.png       # 或 /images/xxx.jpg；社群分享預覽圖
related_products: 18,16,3      # 商品 serial（逗號分隔），底部會顯示
summary: 重點1 | 重點2 | 重點3 | 重點4   # 用 | 分隔，會渲染成「重點整理」區塊
-->
<article-body>
<p class="article-lead">第一段，會被特別樣式呈現（綠底）。</p>

<h2>標題 H2</h2>
<p>...</p>

<h3>子標題 H3</h3>
<p>...</p>

<ol>
  <li>編號清單</li>
</ol>

<ul class="info-list">
  <li>📍 圖示清單</li>
</ul>

<dl class="faq">
  <dt>問題？</dt>
  <dd>答案。會自動產生 FAQPage schema。</dd>
</dl>

</article-body>
```

## 寫文章前

**務必先讀 `docs/SEO_NEW_ARTICLE_CHECKLIST.md`**，照清單跑完才發布。

## 排版規則（重要）

- 不使用「──」「—」破折號，改用「，」
- 超連結不要寫 inline style，CSS 已統一設定（無底線、品牌綠色、hover 變深）
- 段落不超過 4 行（50+ 客群閱讀友善）

## AI 摘要友善（每篇都要）

- **必填 `summary:`**：4~5 個重點、用 ` | ` 分隔。build 會自動渲染成「重點整理」
  區塊放在第一段後，並標進 Article schema 的 `speakable`，是 AI Overviews /
  語音助理最常抽的格式。
- 第一段（`article-lead`）開頭就把「答案」講完，不要鋪陳。
- H2/H3 盡量寫成使用者會問的「問句」（例：「慢箋一次能領多久？」）。

## 發布

```bash
python build_data.py
git add articles site
git commit -m "新文章：{標題} 鎖 {主要關鍵字}"
git push
```

Cloudflare Pages 自動部署，1~2 分鐘上線。

## 後續維護

修改現有文章：直接編輯 `articles/{slug}.html`、重新 build、commit、push。
刪除文章：刪除 `articles/{slug}.html`，build 會自動把 `site/articles/{slug}/` 砍掉。
