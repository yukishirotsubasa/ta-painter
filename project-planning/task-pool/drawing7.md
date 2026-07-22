# drawing7 — 線條顏色可調

## 說明

線資料結構（`trendLinePrimitive.ts` 的線層級樣式，現況只有 `points`）加入 `color`（可調）與 `width`（**僅入結構供 renderer 讀取，暫不開放 UI 調整**）欄位；`TrendLinePaneRenderer.draw()` 改讀該線的 `color`/`width`（現況用模組級寫死 `LINE_COLOR`/`LINE_WIDTH`）。主畫面畫線工具列提供選色 UI：畫線時選定顏色套用到新線；亦可對（透過側邊欄）選取的線改色。

## 依賴

drawing6

## 驗收方式

1. 以不同顏色畫多條線，各線顏色獨立正確。
2. 選取某線後改色，該線顏色即時更新。
3. `width` 欄位存在於資料結構且 renderer 生效（預設值），UI 暫不提供調整入口。
