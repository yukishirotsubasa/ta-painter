# 手動畫線（`web/src/lib/chart/drawing/`、`components/chart/ChartContainer.tsx`）

> 本文件記錄**已實作**的畫線模組：`TrendLinePrimitive` 渲染機制（drawing1）+ 正式的 `DrawingController`（drawing2，模式切換、事件處理、多線陣列管理）+ 切換股票自動清除畫線（drawing3）。選取刪除單條線（drawing4）尚未實作。整體規劃見 `project-planning/design.md`。

## `TrendLinePrimitive`（`lib/chart/drawing/trendLinePrimitive.ts`）

```ts
interface TrendLinePoint {
  time: Time;
  price: number;
}

class TrendLinePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType, Time> | null;
  points: [TrendLinePoint, TrendLinePoint] | null;

  attached(param: SeriesAttachedParameter<Time>): void;
  detached(): void;
  setPoints(points: [TrendLinePoint, TrendLinePoint] | null): void;
  updateAllViews(): void;
  paneViews(): readonly IPrimitivePaneView[];
}
```

- 座標存邏輯座標 `{ time, price }` 而非 pixel。`TrendLinePaneView.update()`（`updateAllViews()` 觸發，庫在 viewport 變動時會自動呼叫）用 `chart.timeScale().timeToCoordinate()` + `series.priceToCoordinate()` 即時換算成 pixel 座標，確保縮放/resize/pan 後線條不跑位。
- `TrendLinePaneRenderer.draw()` 用 `target.useBitmapCoordinateSpace()` + `ctx.scale(horizontalPixelRatio, verticalPixelRatio)` 畫線，顏色 `#f5a623`、寬度 2px。
- 純渲染邏輯，跟互動方式（拖曳）無關，只負責依 `points` 畫線。
- 每條線各自是獨立的 `TrendLinePrimitive` 實例，由 `DrawingController` 建立、`attachPrimitive()`/`detachPrimitive()` 掛載與卸載。

## `DrawingController`（`lib/chart/drawing/drawingController.ts`）

```ts
interface DrawingControllerOptions {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  container: HTMLElement;
}

class DrawingController {
  constructor(options: DrawingControllerOptions);
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  clearAll(): void;
  dispose(): void;
}
```

`ChartContainer.tsx` 在建立 chart/series 後即 `new DrawingController({ chart, series: candlestickSeries, container })`（存進 ref），`drawingMode` prop 變動時呼叫 `setEnabled()`，元件卸載時呼叫 `dispose()`。

### 按下拖曳互動（桌面與行動統一）

- **開啟（`setEnabled(true)`）**：`chart.applyOptions({ handleScroll: false, handleScale: false })` 關閉原生 pan/zoom（含觸控），並在 `container` 上掛原生 `mousedown`/`touchstart`/`touchmove`/`touchend`/`touchcancel` 監聽器，`window` 上掛 `mouseup`，並 `chart.subscribeCrosshairMove()`。
- **按下**：因 chart API 沒有「按下」事件可訂閱，起點座標改用 `chart.timeScale().coordinateToTime(x)` + `series.coordinateToPrice(y)` 自行換算（`x`/`y` 為相對 `container` 的座標）；只接受 y 落在主圖（K 線）pane 高度內（`chart.panes()[0].getHeight()`）的按下，避免用量能 pane 的 y 座標誤套主圖價格軸。
- **拖曳中**：`subscribeCrosshairMove` 取得即時座標，只要處於拖曳狀態就持續更新終點畫出預覽線（第一次移動時才真正 `new TrendLinePrimitive()` + `attachPrimitive()`，存在 `activeLine`，尚未進入 `lines` 陣列）。
- **放開**：`mouseup`（掛在 `window`，避免放開時游標已離開 canvas 而漏接）/`touchend`/`touchcancel` 把 `activeLine` push 進內部 `lines: TrendLinePrimitive[]` 陣列並清空 `activeLine`/`anchor`/`dragging`，該線的 `points` 維持在放開當下的座標不再更新。**每次完整拖曳都會產生一條新線**，不會覆蓋先前已定案的線（drawing1 spike 版本用單一 `trendLineRef` 會互相覆蓋，drawing2 已改為陣列管理）。
- 另掛一個 `touchmove` 監聽器（`{ passive: false }`），僅在拖曳中呼叫 `preventDefault()`，避免瀏覽器原生觸控捲動搶走拖曳手勢。
- **關閉（`setEnabled(false)`）**：`handleScroll`/`handleScale` 恢復為 `true`，unsubscribe 所有監聽器；若關閉當下有未定案的拖曳中的線（`activeLine`）會被捨棄（`detachPrimitive` + 不 push 進陣列），已定案的線（`lines` 陣列內）不受影響、畫面上維持顯示。

### 線條管理與清除

- `clearAll()`：捨棄未定案的 `activeLine`（如有），遍歷 `lines` 陣列逐一 `series.detachPrimitive()` 並清空陣列。純記憶體狀態，不持久化，`detachPrimitive()` 是真的卸載而非隱藏，切回原本股票代號不會「復原」畫線。
- **切股清除（drawing3）**：`ChartContainer.tsx` 新增 `stockNo` prop，`useEffect(() => { drawingControllerRef.current?.clearAll(); }, [stockNo])` 在 `stockNo` 變動時呼叫 `clearAll()`；`App.tsx` 把 `stockNo` state 往下傳。因為 effect 依賴 `[stockNo]`，首次掛載時也會呼叫一次（此時 `lines` 本來就是空陣列，無副作用）。
- `dispose()`：`setEnabled(false)` + `clearAll()`，供 `ChartContainer` 卸載時呼叫，確保元件重建/卸載不殘留 primitive 或事件監聽器。
- 目前尚未實作「選取某條線並刪除」的互動（見 [drawing4](../project-planning/task-pool/drawing4.md)）。

### 畫線模式視覺提示

- `App.tsx` 的切換按鈕（`className="drawing-toggle"`）用 `aria-pressed` 屬性反映開關狀態；`App.css` 對 `[aria-pressed='true']` 套用 `--accent`/`--accent-bg`/`--accent-border`（與 `IndicatorPanel` 既有的 accent 色系一致）+ 粗體高亮，按鈕文字同時切換為「畫線模式：開/關」。
- 圖表容器在 `drawingMode` 開啟時多掛 `chart-container-drawing` class（`ChartContainer.css`），套用 `cursor: crosshair`。

## 手動驗證紀錄

因 sandbox 網路限制與 Claude Code Browser 預覽面板本身的截圖/canvas resize 異常（環境限制，非本專案程式碼問題，drawing1、drawing2、drawing3 三次驗證都遇到同一個限制：`document.visibilityState` 卡在 `"hidden"`，導致 canvas backing store 卡在預設 300×150、`computer` 的 `screenshot`/`zoom`/`left_click_drag` 動作持續 timeout；換分頁、重啟 preview server 皆無法排除），核心互動邏輯改用 `javascript_tool` 對真實 `IChartApi`/`ISeriesApi` 實例做白盒驗證（seed 合成 K 線資料，因無法連外抓 TWSE 真實資料）：

- 按下（`mousedown`）正確用 `coordinateToTime`/`coordinateToPrice` 算出起點 time/price，此時尚未建立 primitive。
- 拖曳中（`mousemove` + `buttons:1` 觸發 `subscribeCrosshairMove`）第一次移動即建立並 `attachPrimitive`，之後每次移動 `points` 的終點正確跟著更新，全程無 console error。
- 放開（`mouseup`）後該線的 `points` 維持在放開當下座標；之後純 hover（`buttons:0`）不再改變 `points`。
- 連續做兩次完整拖曳手勢，全程無 console error（多線陣列 push 邏輯是單純 TypeScript push/detach，未見執行期錯誤；受限於上述 canvas 環境限制，未能用截圖/pixel 取樣逐一比對兩條線各自的視覺位置）。
- 畫線模式開啟時對 canvas 做一次完整平滑拖曳手勢，`chart.timeScale().getVisibleLogicalRange()` 拖曳前後完全不變（pan 被擋下）；關閉畫線模式後同一組手勢會正常平移圖表。
- 畫線模式按鈕點擊後，讀取 computed style 確認 `aria-pressed="true"`、`color`/`background` 變為 accent 色、圖表容器 `cursor: crosshair`，視覺提示生效。

使用者另外在自己的真實瀏覽器（非本機沙盒環境）手動測試並確認：K 線／成交量／價格軸／指標按鈕正常渲染，canvas resize 正常；拖曳畫出的趨勢線顏色（`#f5a623`）、走向與拖曳軌跡一致；縮放圖表（zoom in/out）與改變視窗大小（resize）後線條仍正確錨定原本時間/價格位置；桌面滑鼠拖曳（按下→拖曳預覽→放開定案）操作流程正確無誤。

**drawing3（切股清除）**：本節開頭所述的 Browser pane 限制第三次出現（drawing1、drawing2 之後），改用 `web/src/lib/chart/drawing/drawingController.test.ts` 的 unit test 驗證 `clearAll()` 行為——用 fake chart/series/container/window（不依賴真實 DOM/canvas）模擬完整拖曳畫線流程：畫兩條線後呼叫 `clearAll()`，驗證 `series.detachPrimitive()` 被呼叫兩次（線條真的被卸載）；再次呼叫 `clearAll()` 驗證不會重複 detach（陣列確實清空，不是隱藏）。`ChartContainer` 內 `stockNo` -> `clearAll()` 的 wiring 本身未經瀏覽器實測，僅靠程式碼比對既有 `drawingMode` effect 的相同模式（`useEffect(fn, [dep])` 呼叫 controller 方法）人工審閱確認正確。

## 已知限制 / 尚未實作

- **行動觸控**：拖曳建立起點的邏輯（`touchstart`）不依賴庫內部事件轉換，風險較低；但「拖曳中 `subscribeCrosshairMove` 對 `touchmove` 的即時反應」尚未實測。集中驗證見 [drawing5](../project-planning/task-pool/drawing5.md)，須在正式部署站台上進行。
- **選取刪除單條線**：目前只能整批 `clearAll()`，無法選取/刪除單一條線；見 [drawing4](../project-planning/task-pool/drawing4.md)。
- **切股清除的瀏覽器實測**：`ChartContainer` 內 `stockNo` 變動觸發 `clearAll()` 的 wiring 尚未在真實瀏覽器中實際畫線＋切股驗證過（受限於本節開頭所述的 Browser pane 環境限制），僅有 `drawingController.test.ts` 的邏輯層驗證 + 程式碼審閱。建議下次有能正常截圖的環境時補做一次真人瀏覽器手動驗證。
