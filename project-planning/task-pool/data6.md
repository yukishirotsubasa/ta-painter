# data6 — YahooProvider（經 Worker Proxy）

## 說明

實作 `YahooProvider`，透過 infra2 部署的 Cloudflare Worker `/proxy/yahoo/...` 轉發呼叫 Yahoo Finance chart API（`query1.finance.yahoo.com/v8/finance/chart/{symbol}`），依股票所屬市場自動組 symbol 後綴（上市 `.TW`、上櫃 `.TWO`）。解析 `timestamp[]` 與 `indicators.quote[0]` 對齊成 `OhlcvBar[]`，過濾 null 缺值。

## 依賴

infra2, data1

## 驗收方式

1. 查詢一個較長區間（例如 2 年）一次請求即可拿到完整資料（不需逐月串接）。
2. 確認查詢速度明顯快於 TWSE 逐月方式。
3. 抽查資料與官方資料源比對，確認無明顯偏差。
