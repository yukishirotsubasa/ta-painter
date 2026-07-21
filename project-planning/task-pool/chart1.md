# chart1 — ChartContainer 初始化與 K 線 Series

## 說明

建立 `components/chart/ChartContainer.tsx`，管理 `lightweight-charts` 的 `createChart` 生命週期（掛載/卸載/resize），加入 `CandlestickSeries`（`addSeries(CandlestickSeries, opts, 0)`），把 `TwseProvider` 取得的 `OhlcvBar[]` 轉換成 series 資料格式並渲染。

## 依賴

data2

## 驗收方式

1. 頁面顯示指定股票的 K 線圖。
2. 目視比對圖表走勢（漲跌起伏、關鍵高低點日期）與 TWSE 官網或其他公開圖表一致。
3. Chart 容器 resize（例如縮放瀏覽器視窗）時圖表正確跟著調整大小，不留白或裁切異常。
