# drawing1 — TrendLinePrimitive 畫線互動 Spike

## 說明

技術驗證性任務（spike）：用 lightweight-charts v5 的 `ISeriesPrimitive`/`IPanePrimitive` 機制做一個最小可行的畫線 demo，驗證設計文件（design.md）待驗證項目 1：畫線模式開啟時關閉 `handleScroll`/`handleScale` 是否確實阻擋原生 pan/zoom；觸控 tap 是否能可靠觸發 `subscribeClick`。

## 依賴

chart1

## 驗收方式

1. 桌面瀏覽器：畫線模式開啟後點擊圖表可放置端點畫出一條線，圖表不會同時被拖曳平移。
2. 桌面瀏覽器：畫線模式關閉後，pan/zoom 恢復正常。
3. 行動裝置（實機或 DevTools 觸控模擬）：tap 能可靠觸發放置端點的邏輯。
4. 將驗證結果（可行/不可行、實際限制）記錄下來，作為 drawing2 正式實作的依據；若發現待驗證項目的風險成真，需在此階段確認替代方案。
