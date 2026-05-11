/* ---------------------------------------------------------------
 * 站台設定 — 把 Google 試算表「以網頁形式發布為 CSV」後，
 * 將取得的網址貼到下面 SHEET_CSV_URL。
 *
 *   ① 開啟你的 Google 試算表
 *   ② 檔案 → 共用 → 發布到網路 (Publish to web)
 *   ③ 選擇要發布的工作表 + 格式 = 「逗號分隔值 (.csv)」
 *   ④ 點「發布」，把網址複製過來貼到下面
 *
 * 試算表第一列必須是欄位名稱 (header)，欄位請參考
 *   data/template.csv
 * 一定要有的欄位：id  (= IG 貼文編號 post_id，會自動和圖片配對)
 * 其它欄位都是可選；空白就會自動隱藏。
 * --------------------------------------------------------------- */

window.SITE_CONFIG = {
  // 把網址貼到下面引號裡。沒設定時網站會用 IG 抓下來的原始資料。
  // 想先預覽勾選後的效果？把網址改成 "data/demo_sheet.csv" 即可。
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7L3_gOGBYqghZt1UKw9uHDN-uIPRp7_5qAMEHrbL7NdhxH1eq7-uKd23qfGMT2hOT37z_Dntjn8uR/pub?gid=895735424&single=true&output=csv",

  // 圖片清單檔（由 build_data.py 產生）
  POSTS_JSON_URL: "/data/posts.json",

  // 自訂顯示名稱
  PHARMACY_NAME_ZH: "惠登藥局",
  PHARMACY_NAME_EN: "Wheadon Pharmacy",
};
