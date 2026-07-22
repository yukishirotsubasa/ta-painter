# sidebar2 — 側邊欄資料源切換區塊

## 說明

側邊欄頂端資料源區塊（常駐、不折疊）。2 選項：**Yahoo（預設）/ 官方**。選「官方」時依 symbol 帶入的市場別自動路由：上市→`TwseProvider`、上櫃→`TpexProvider`（複用 `providerRegistry`）。因官方源為逐月抓取，切到官方時顯示逐月抓取等待提示。request 次數限制屬**程式內部節流/限流**（避免頻繁查詢被上游封鎖），**不顯示提示給使用者**（複用 data7 的 `estimateSlow`/內部限流）。App 預設資料源由現行寫死 TWSE（`App.tsx:55`）改為 Yahoo。

## 依賴

data7, symbol2

## 驗收方式

1. 資料源區塊在側邊欄頂端，預設 Yahoo，可切「官方」。
2. 選官方後查上市/上櫃代號分別走 TWSE/TPEx 並取得正確資料。
3. 切官方源查長區間時顯示逐月抓取等待提示；Yahoo 快查時不顯示。request 次數限制為程式內部節流，不對使用者顯示提示。
