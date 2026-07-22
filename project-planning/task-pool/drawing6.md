# drawing6 — DrawingController 曝光線清單、移除畫布點擊選取

## 說明

`DrawingController`（`web/src/lib/chart/drawing/drawingController.ts`）為每條線加穩定 id，新增對外 API：`getLines()`、`onLinesChange(cb)`、public `deleteLine(id)`（供 React / 側邊欄使用）。**移除畫布點擊選取線段的整條路徑**：`hitTestLines()` / 點擊選取 / `selectedLine` / 鍵盤 Delete/Backspace 刪除，改由側邊欄清單（sidebar3）選取與刪除。可選：提供 `highlightLine(id)` 供清單 hover/選取時高亮對應線段。切股 `clearAll()` 沿用並觸發 `onLinesChange`。此為 sidebar3 前置，並一併消解「命中容差太小」「觸控無刪除 UI」兩項技術債。

## 依賴

無。

## 驗收方式

1. 畫線/刪除/切股清除時 `onLinesChange` 正確回報目前線清單（unit test 以 fake 物件驗證）。
2. `deleteLine(id)` 能刪除指定線並反映在圖上與 `getLines()`。
3. 畫布點擊不再選取線段（點擊選取路徑已移除），畫線（按下拖曳）與 pan/zoom 行為不受影響。
