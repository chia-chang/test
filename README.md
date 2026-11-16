# 炙序 GYOZA

靜態品牌展示網站，含浮動 Google 預約連結及 PWA。

## 部署與安裝

將本儲存庫的檔案部署到 HTTPS 靜態主機（例如 GitHub Pages）。PWA 使用相對路徑，可部署在 `/test/` 等子目錄；本機開發也可使用 localhost。直接開啟 `file://` 不支援 Service Worker。

支援的 Chromium 瀏覽器符合安裝條件後，頁尾會出現「安裝炙序 App」。iPhone／iPad 使用 Safari 的分享選單 →「加入主畫面」。

第一次連網載入並完成快取後，可離線開啟首頁與使用本機展示互動。外部餐點照片、字型、地圖、Google 預約仍需要網路。購物車與訂單為原有展示功能，不會送出實際訂單。

修改離線資源時，請遞增 `sw.js` 的快取版本。新版本會在舊頁面全部關閉後啟用。

## 樣式

已提交編譯好的 `assets/site.css`，部署不需要 Node.js。修改 HTML 的 Tailwind 樣式後執行：

```sh
npm ci
npm run build:css
```

Lucide 0.468.0 已存於 `assets/`，授權見 `assets/lucide-LICENSE`。

## App 圖示

`assets/icons/gyoza-original.png` 是使用作圖工具生成的寫實發光鍋貼 PNG 原圖；同目錄包含 180、192、512 像素 PNG，以及保留安全邊界的 maskable 圖示。
