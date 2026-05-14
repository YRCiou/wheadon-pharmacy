# 惠登藥局 SEO 背景檔 ★ ENTRY POINT

> 這是此專案 SEO 工作的「唯一資料來源」。
> 任何 SEO 檢查、Meta 改寫、新文章生成、結構化資料調整之前，**先讀完本檔**。
> 本檔僅描述 `99_wheadon.pharmacy/` 這個專案，請勿混雜其他 InnovaRad 客戶。

---

## 0. 工作流規則（給未來的 Claude）

每次接到「做 SEO」「寫新文章」「優化頁面」「檢查 SEO」這類任務，順序固定：

1. **Read** `docs/SEO_CONTEXT.md`（本檔）
2. **Read** `docs/SEO_STRATEGY.md`（地點 × 服務 × 組合的整合策略）
3. 若是新文章 → **Read** `docs/SEO_NEW_ARTICLE_CHECKLIST.md`
4. 若需對手分析 → **Read** `docs/competitors/*.md`
5. 完工後，把新發現（關鍵字、競爭對手變動、Google 演算法觀察）寫回 `docs/competitors/` 或本檔的「最近更新」段落

不照這個流程做出來的東西**不算數**，會被使用者退稿。

---

## 1. 網站基本資料

| 項目 | 內容 |
|---|---|
| 網站 | https://wheadon-pharmacy.pages.dev/ |
| 部署 | Cloudflare Pages（從 GitHub `YRCiou/wheadon-pharmacy` 自動部署） |
| 後台 | https://wheadon-pharmacy.pages.dev/ruthie/ |
| 商家名 | 惠登藥局 Wheadon Pharmacy |
| 地址 | 406 臺中市北屯區平順里昌平路一段 434 號 |
| 電話 | (04) 2422-5682（國際格式 +886-4-2422-5682） |
| 營業時間 | 週一～週六 09:00–21:00（週日公休） |
| IG | https://www.instagram.com/wheadonpharmacy/ |
| LINE 官方 | @052gbxsj（https://lin.ee/Zcku5o0 ） |
| 統編 / 健保特約 | 健保特約藥局，可領處方箋（含慢箋） |

## 2. 服務項目（這是核心關鍵字基底）

### 線下實體門市
- **健保處方箋 / 慢箋調劑**（西藥）
- **中藥調劑**（藥局可中西醫調劑，是少數兼具中西藥能力的社區藥局）
- 保健食品、營養品零售
- OTC 成藥諮詢與販售
- 醫材、衛材

### 線上
- 保健食品銷售（透過官網商品頁 + LINE 諮詢，**不主動公開特價**，價格洽詢）
- 商品查詢介面（依藥品 / 症狀搜尋）
- IG 同步同款商品

> 線下強項 = 中西藥整合 + 處方箋；線上強項 = 商品查詢 + LINE 即時諮詢。
> SEO 內容務必同時呈現「線上可買」與「實體值得來」兩條線。

## 3. 目標地域（Geo Targeting）

| 層級 | 範圍 | SEO 策略 |
|---|---|---|
| 主戰場（步行 / 5 分鐘車程） | 北屯區（平順里、四民里、軍功里、松竹里、舊社里） | 在地關鍵字、Google 商家最佳化 (GBP)、區域長尾詞 |
| 次戰場（10–15 分鐘車程） | 北區、西屯區、中區、西區 | 比較類關鍵字、處方箋 / 慢箋類 |
| 鄰近區 | 大里區（跨大坑山區或經中清路） | 「台中 中西藥」「台中 中藥調劑藥局」長尾 |
| 全台 | 線上保健食品電商 | 品牌 + 商品名稱關鍵字（如「特蒂樂乳膏」「醫立妥」） |

> 全台等級的競爭強，**主力資源仍放台中、特別是北屯**。

## 4. 用戶輪廓（Persona）

從現有商品（痔瘡藥、皮膚科外用、婦科陰道錠、護眼乳劑、保健品）反推：

- **A：50+ 在地住戶**（主客）：拿處方箋、買慢箋、買保健食品、家庭採購
- **B：30–50 慢性病家屬**：替父母/家人來領藥、買醫材
- **C：女性私密保養 / 皮膚問題**：羞於就醫，靠搜尋找到藥師
- **D：醫美 / 處方等候族**：找特定品名（特蒂樂、醫立妥、宜可利、滴舒適）

→ 字級放大（已實作）、術語並陳中英文、商品標題務必含「成分英文名」對應品名搜尋。

## 5. 技術現況（已實作）

- 預渲染 SSG（`build_data.py` 在 GitHub Actions 跑）
- 每商品獨立 URL：`/products/{N}/`，含獨立 OG / Twitter Card / canonical
- 全站結構化資料：`<script type="application/ld+json">` Pharmacy schema
- `sitemap.xml` 自動產生（首頁 + 所有商品頁）
- `_redirects` 處理 SPA fallback
- GTM `GTM-PFVCRJ2V`、Microsoft Clarity `wpsvug3h7h`
- Google Maps iframe（footer）
- LINE / 電話浮動 CTA
- 模糊搜尋（Levenshtein 容錯）

## 6. 主競爭對手（細節見 `docs/competitors/`）

| 對手 | 規模 | 強項 | 弱項 / 我的切入點 |
|---|---|---|---|
| 大樹藥局 greattree | 全國連鎖 600+ 店 | 品牌、App、廣告預算 | 在地內容稀薄、無 GBP 在地 SEO 文案 |
| 瑞昌藥局 richpharmacy | 台中為主、衛教專欄 | 衛教文章已建立、藥師密度宣傳 | 中藥 / 慢箋著墨少 |
| 全成藥局 ccdrugstore | 台中北屯、北屯路 | **同區直接對手**、4.7★ / 73 則評價 | 無部落格、無中藥定位 |

**惠登的差異化主軸**：
1. **可中西醫調劑** — 三家對手沒一家強打這點
2. **小而專、藥師親自諮詢** — 對抗大樹的「連鎖、人多但匆忙」
3. **線上 + LINE 1:1** — 對抗全成的「網站只是型錄」

## 7. 最近更新

### 整體進度總覽（2026-05-13 截止）

| 工作項目 | 狀態 | 備註 |
|---|---|---|
| 站點上線 + Cloudflare Pages 部署 | ✅ | https://wheadon-pharmacy.pages.dev/ |
| Apps Script Web App 後端（試算表 + 認證） | ✅ | /ruthie/ 後台、多管理員 |
| 商品 IG 同步 + 試算表合併 | ✅ | 21 個商品 + IG 自動匯入 |
| GTM `GTM-PFVCRJ2V` | ✅ | 全頁面 |
| Microsoft Clarity `wpsvug3h7h` | ✅ | 全頁面 |
| 浮動 LINE / 電話 CTA | ✅ | 永遠顯示（50+ 客群友善） |
| Footer Google Maps 嵌入 | ✅ | |
| 骨架屏載入動畫 | ✅ | 後台 + 前台 |
| 模糊搜尋（Levenshtein） | ✅ | 容錯打錯字 |
| **SEO 批次 1**：首頁 Meta + LocalBusiness JSON-LD | ✅ | 加 medicalSpecialty / paymentAccepted / areaServed / hasOfferCatalog |
| **SEO 批次 2**：商品頁 title / description / Product schema | ✅ | 完售品標 OutOfStock；無價商品略過 offers 避免 Rich Results invalid |
| **SEO 批次 3**：首頁「我們的服務」+「常見服務組合」section | ✅ | 3 服務卡 + 5 bundle 卡，bundle 點擊觸發 fuzzy 過濾 |
| **SEO 批次 4**：`/articles/` 路由 + Article + FAQPage schema | ✅ | datetime 含台灣時區 |
| **SEO 批次 5**：第 2 篇文章 | ✅ | 〈北屯慢箋懶人包〉|
| **SEO 批次 6**：首頁加最新文章區塊 | ✅ | bundles 下方 |
| **SEO 批次 7**：本檔最近更新整理 | ✅ | 你看到的就是 |

### 內容生產進度（依 SEO_STRATEGY.md §5）

| 文章 | 主關鍵字 | 狀態 |
|---|---|---|
| Month 1 ①〈北屯昌平路藥局推薦〉 | 北屯昌平路藥局 | ✅ 2026-05-12 |
| Month 1 ②〈台中北屯區慢箋領藥懶人包〉 | 北屯慢箋 | ✅ 2026-05-13 |
| Month 1 ③〈為什麼選社區藥局而不是大醫院？〉 | 北屯社區藥局 | ✅ 2026-05-14 |
| Month 2 ④〈異位性皮膚炎、濕疹用藥指南〉 | 異位性皮膚炎用藥 | ⏸️ 暫下架（待法規確認） |
| Month 2 ⑤〈女性私密發炎、不適常見問題〉 | 女性私密保養 | ⏸️ 暫下架（待法規確認） |
| Month 2 ⑥〈秋冬保肺：養肺寧散用法〉 | 養肺寧散 | ⏳ 待寫 |

### 結構化資料覆蓋

| Schema 類型 | 頁面 | 通過 Rich Results Test |
|---|---|---|
| Pharmacy (LocalBusiness + Organization) | 所有 26 個 HTML | ✅ |
| Product | 21 個商品頁 | ✅（無價商品略過 offers） |
| Article | 3 個文章頁 | ✅ |
| FAQPage | 3 個文章頁 | ✅ |

### 流量起點（基準線）

- Search Console：已提交 sitemap.xml（25 URLs，含 1 首頁 + 21 商品 + 1 articles 列表 + 2 文章）
- 「無法擷取」是 Search Console 暫存狀態，curl 驗證 Googlebot 可正常存取
- Clarity dashboard：等累積 session 中

### 已知限制 / 待辦

- **`*.pages.dev` 域名**：Cloudflare 文件建議不要當 production，長期應接 custom domain（如 `wheadon.pharmacy` / `wheadon-pharmacy.tw`）
- **GBP 評價衝量**：尚未啟動，目標 3 個月內 ≥80 則（超越全成北屯店）
- **Lighthouse 跑分**：尚未基準量測
- **第 3 篇文章**：依排程要寫

### 完整時間軸

- 2026-05-08：站點初版上線
- 2026-05-09：IG 商品同步、試算表設定
- 2026-05-10：Apps Script 後台、多管理員、Product modal
- 2026-05-11：/products/N 路由、預渲染 SSG、SEO 結構化資料初版
- 2026-05-12：footer 地圖、骨架屏、模糊搜尋、浮動電話鈕、Clarity 安裝
- 2026-05-12：Clarity 開始收 session（site key `wpsvug3h7h`）
- 2026-05-12：SEO 批次 1~4 完成（首頁 Meta、商品 Product schema、首頁服務/組合 section、/articles/ 路由）
- 2026-05-12：第 1 篇〈北屯昌平路藥局推薦〉發布，鎖「北屯昌平路藥局」
- 2026-05-13：第 2 篇〈台中北屯區慢箋領藥懶人包〉發布，鎖「北屯慢箋」
- 2026-05-13：浮動 CTA 改成永遠顯示（移除下滾隱藏）
- 2026-05-13：SEO 批次 6 完成（首頁加最新文章區塊）+ 批次 7 完成（本檔整理）
- 2026-05-14：FAQ 樣式調整（Q/A 對齊本文左緣、移除米色框）
- 2026-05-14：新功能「公佈欄」（後台編輯、前台動態顯示，HTML 消毒）
- 2026-05-14：批次 5 結束（共 5 篇文章：Month 1 ①②③ + Month 2 ④⑤）
  * #3〈為什麼選社區藥局而不是大醫院〉鎖「北屯社區藥局」
  * #4〈異位性皮膚炎用藥指南〉鎖「異位性皮膚炎用藥」
  * #5〈女性私密發炎 QA〉鎖「女性私密保養」+ 加 .warning-box CSS class
- 2026-05-14：④⑤ 兩篇**暫下架**，待用戶確認《藥事法》相關法規後再決定上線方式
  * 源檔已刪除、輸出目錄已清空、sitemap 自動更新為 26 URLs
  * 〈社區藥局 vs 大醫院〉#3 不涉及藥品介紹，保留上線

> ★ 更新本檔時請加日期 + 一行摘要，方便未來追蹤。
