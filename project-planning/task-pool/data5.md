# data5 — TpexProvider（經 Worker Proxy）

## 說明

實作 `TpexProvider`，透過 infra2 部署的 Cloudflare Worker `/proxy/tpex/...` 轉發呼叫 TPEx 官方日成交資訊 API，取得上櫃股票歷史資料並轉換為 `OhlcvBar[]` 格式。需確認 TPEx 逐月查詢的實際參數/回應格式（民國年日期格式等）。

## 依賴

infra2, data1

## 驗收方式

1. 在瀏覽器 console 呼叫 `TpexProvider.fetchDaily('6488', ...)`（上櫃股票代號），取得正確格式資料。
2. Network 面板確認請求實際打到 Worker domain（非直連 TPEx，避免 CORS 被擋），回應狀態 200。
3. 抽查數字與 TPEx 官網頁面顯示的收盤價/成交量比對一致。
