# 訂單串接 Google Sheet 設定指南

流程：網站結帳 → `fetch` POST → Google Apps Script（Web App）→ 驗證並寫入 Google 試算表 → 寄通知信。

## 架構與安全設計

- 前端只送「品項代碼＋數量」與聯絡資料；**價格、運費、總計全部由 GAS 依 `Products` 工作表重新計算**，不信任瀏覽器送來的金額。
- 以 `LockService` 避免同時下單時訂單編號重複；編號格式 `ZX-YYYYMMDD-0001`（每日重新計數）。
- 隱藏的 honeypot 欄位擋機器人；欄位長度、手機、Email、數量上限皆在伺服端驗證。
- 寫入前會處理 `=`、`+`、`-`、`@` 開頭的內容，避免試算表公式注入。
- 前端以 `text/plain` 傳送，避開 Apps Script 不支援的 CORS 預檢（OPTIONS）。

## 設定步驟

1. 建立一份新的 Google 試算表（建議命名「炙序訂單」）。
2. 選單 **擴充功能 → Apps Script**，把 `gas/Code.gs` 的內容整份貼上並儲存。
3. 視需要修改檔案最上方 `CONFIG`：
   - `NOTIFY_EMAIL`：店家收新訂單通知的 Email（留空則不寄）
   - `SEND_CUSTOMER_EMAIL`：是否寄確認信給顧客
4. 在編輯器選擇函式 `setup` → **執行**，並授權（試算表、寄信權限）。完成後會出現三張工作表：
   - `Orders`：每筆訂單一列（狀態有下拉選單與顏色）
   - `OrderItems`：每個品項一列，方便統計
   - `Products`：菜單與價格（改價請在這裡改；`active` 取消勾選即停售）
5. **部署 → 新增部署作業 → 類型選「網頁應用程式」**
   - 執行身分：**我**
   - 誰可以存取：**所有人**
   - 部署後複製以 `/exec` 結尾的網址。
6. 打開 `index.html`，把網址貼進 `ORDER_ENDPOINT`：
   ```js
   const ORDER_ENDPOINT = 'https://script.google.com/macros/s/xxxxxxxx/exec';
   ```
7. 部署網站。結帳頁的說明文字與隱私說明會自動切換為「資料會傳送給店家」。

驗證：用瀏覽器開 `…/exec`，應看到 `{"ok":true,"service":"zhixu-orders"}`；`…/exec?action=products` 會列出菜單。

## 日後修改 GAS

改完程式要 **部署 → 管理部署作業 → 編輯 → 新版本**，網址才會套用新程式碼（網址不變）。

## 注意事項

- 試算表內含顧客個資（姓名、電話、Email、地址），請**不要公開分享**，只開放給店家人員。
- 目前不做線上收款，付款方式為取餐／收貨時付款。
- 菜單品項若在 `index.html` 新增，需同步新增到 `Products`，否則伺服器會回「有商品目前無法訂購」。
- Apps Script 有每日寄信額度（一般帳號約 100 封／日），訂單量大時可關閉顧客確認信。
- 正式上線前請依實際營運補上隱私政策與交易條款。
