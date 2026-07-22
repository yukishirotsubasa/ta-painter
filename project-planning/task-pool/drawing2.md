# drawing2 — DrawingController 正式實作

## 說明

基於 drawing1 的驗證結果，正式實作 `TrendLinePrimitive.ts`（渲染邏輯）與 `DrawingController.ts`（模式切換、事件處理、線條管理）。採**按下拖曳**互動模式（桌面與行動統一）：按下記錄起點、拖曳中即時預覽、放開定案。座標存邏輯座標（time+price），`draw()` 內即時用 `series.priceToCoordinate`/`timeScale.timeToCoordinate` 轉換。

## 依賴

drawing1

## 驗收方式（僅桌面；行動觸控驗證集中在 [drawing5](drawing5.md)）

1. 畫一條線後，縮放圖表（zoom in/out）或改變視窗大小（resize），線條仍正確錨定在原本的時間/價格位置，不跑位。
2. 畫線模式開啟時有明顯視覺提示（按鈕高亮/提示文字）。
3. 桌面滑鼠拖曳操作皆能正確完成畫線流程（按下→拖曳預覽→放開定案）。

## 驗證結果（2026-07-22）

### 實作內容

- `web/src/lib/chart/drawing/drawingController.ts`：新增 `DrawingController` class，把 drawing1 spike 中直接寫在 `ChartContainer.tsx` `useEffect` 裡的事件處理邏輯（mousedown/touchstart 起點、`subscribeCrosshairMove` 拖曳預覽、mouseup/touchend/touchcancel 定案、handleScroll/handleScale 互斥切換）抽成獨立類別，介面為 `setEnabled(boolean)` / `clearAll()` / `dispose()`。內部用 `lines: TrendLinePrimitive[]` 陣列管理已定案的線（每次完整拖曳放開後 push 一條新線，不再像 spike 只維護單一 `trendLineRef` 互相覆蓋），`clearAll()` 遍歷陣列逐一 `series.detachPrimitive()` 並清空，對齊 design.md 已定案的 `DrawingController.clearAll()` 介面，供 drawing3（切股清除）直接呼叫；多線的「選取刪除單條」互動留給 drawing4。
- `web/src/lib/chart/drawing/trendLinePrimitive.ts`：未變動，drawing1 的版本本身已是可直接沿用的正式渲染邏輯（純渲染、跟互動方式無關）。
- `web/src/components/chart/ChartContainer.tsx`：移除原本內嵌在 `useEffect` 裡的事件處理程式碼，改為建構時 `new DrawingController({ chart, series, container })`（存進 `drawingControllerRef`），`drawingMode` prop 變動時呼叫 `setEnabled()`，卸載時呼叫 `dispose()`。另外 `drawingMode` 開啟時容器多掛 `chart-container-drawing` class。
- 視覺提示（驗收項目 2）：`App.tsx` 畫線模式按鈕加上 `drawing-toggle` class，`App.css` 用 `[aria-pressed='true']` 選取器套用 `--accent`/`--accent-bg`/`--accent-border`（跟 `IndicatorPanel` 既有的 accent 色系一致）+ 粗體；`ChartContainer.css` 的 `.chart-container-drawing` 在畫線模式開啟時把游標換成 `crosshair`。

### 驗證方式與結果

- `tsc --noEmit`、`vitest run`（57 tests）、`oxlint` 均通過。
- 驗收項目 1（縮放/resize 錨定）與項目 3（桌面滑鼠拖曳流程）：座標轉換管線（`TrendLinePaneView.update()` 用邏輯座標即時換算 pixel）與拖曳事件邏輯皆**原封不動搬移**自 drawing1 已驗證過的實作，僅重構成 class、新增陣列管理，未改變座標轉換或事件判斷邏輯本身，經使用者確認**沿用 drawing1 驗證結果，本次跳過重新驗收**。
- 驗收項目 2（視覺提示）：啟動本機 dev server，用 `javascript_tool` 點擊畫線模式按鈕後讀取 computed style 確認——按鈕 `aria-pressed="true"`、文字變成「畫線模式：開」、`color: rgb(192, 132, 252)`（`--accent`）、`background: rgba(192, 132, 252, 0.15)`（`--accent-bg`）；圖表容器 `className` 多了 `chart-container-drawing`、`cursor: crosshair`。**確認可行**。
- 另外用 `javascript_tool` 對 canvas 模擬兩次完整拖曳手勢（含 mouseenter/mouseover 讓 `subscribeCrosshairMove` 生效），過程與結束後 `read_console_messages` 均無 error，功能面未見異常；但無法用截圖或 canvas pixel 取樣做視覺比對兩條線是否分別正確顯示——這台機器上 Browser 預覽面板的 canvas backing store 仍卡在預設 300×150（drawing1 已記錄過的同一個環境限制，未隨 `autoSize` 縮放到實際顯示尺寸），`computer` 的 `screenshot` 動作本次也再次 timeout。此限制與程式碼無關，多線陣列管理邏輯本身（純 TypeScript push/detach）已足夠簡單直接，風險低。
