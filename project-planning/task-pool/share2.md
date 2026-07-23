# share2 — URL Hash 還原邏輯

## 說明

App 啟動時解析 `location.hash`（`#s=<lz-string編碼>`），成功解碼後依序：設定 symbol/provider → 觸發資料抓取 → 資料到齊後依 `indicators` 陣列從 registry 逐一 mount → 依 `lines` 陣列重建 `TrendLinePrimitive` 並 attach。使用者互動後用 `history.replaceState` 同步更新 hash。「分享」按鈕即複製目前網址列。還原時 `stockNo` 由外部（非 `ChartToolbar` 自身）改變，需讓 `ChartToolbar` 同步顯示還原後的代號（加 `useEffect(() => setDraft(stockNo), [stockNo])` 或改全受控，消解對應技術債）。

**需先補 `DrawingController.addLine()`**：`DrawingController`（drawing6/drawing7）目前建立線條的唯一路徑是 `onCrosshairMove` 內的拖曳流程，對外只有讀（`getLines`/`onLinesChange`）、刪（`deleteLine`/`clearAll`）與「設定之後新線顏色」（`setDrawingColor`），沒有「直接用一組 `{ points, color, width }` 建立一條線」的 public 方法，因此 `lines` 陣列（share1 編碼含 `t1.p1.t2.p2.color.width`）無從還原。本任務需新增 `addLine(points, style?): string`（回傳新線 id），內部沿用同一套 `nextLineId()` + `attachPrimitive()` + `emitLinesChange()`，讓還原路徑與拖曳路徑共用同一份線條管理邏輯；`style` 直接餵給 `TrendLinePrimitive` constructor 即可，**不需要也不應該放寬 `TrendLinePrimitive.style` 的 `readonly`**（drawing7 的「畫出後不可改色」由此保證）。

## 依賴

share1

## 驗收方式

1. 設定好股票代號、多個指標、畫幾條線後，複製目前網址，在新分頁貼上開啟，畫面完整還原（股票、指標種類與參數、線條位置與顏色）。
2. 手動修改 hash 為不合法字串開啟頁面，確認 App 正常載入（顯示錯誤提示，不白畫面/不崩潰）。
3. 操作過程中（換指標/畫線）hash 持續更新，但瀏覽器上一頁記錄沒有被灌爆（用 replaceState 而非 pushState）。
