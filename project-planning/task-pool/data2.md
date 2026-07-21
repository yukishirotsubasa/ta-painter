# data2 — TwseProvider 單月查詢

## 說明

實作 `TwseProvider`，呼叫 `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=YYYYMMDD&stockNo=XXXX`（單月）。處理回應格式轉換：民國年轉西元年、字串數字（含千分位逗號）轉 number，輸出符合 `OhlcvBar[]` 格式。此階段先只處理單月查詢，不做逐月串接（見 data3）。

## 依賴

data1

## 驗收方式

1. 在瀏覽器 console 直接呼叫 `TwseProvider.fetchDaily('2330', { from: '2024-09-01', to: '2024-09-30' })`，取得資料。
2. 抽查資料中幾筆日期的 OHLC 數字，與 TWSE 官網「個股日成交資訊」頁面顯示的數字比對一致。
