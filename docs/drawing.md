# 手動畫線（`web/src/lib/chart/drawing/`、`components/chart/ChartContainer.tsx`、`components/chart/DrawingToolbar.tsx`）

> 本文件記錄**已實作**的畫線模組：`TrendLinePrimitive` 渲染機制（drawing1）+ 正式的 `DrawingController`（drawing2，模式切換、事件處理、多線陣列管理）+ 切換股票自動清除畫線（drawing3）+ drawing6：每條線帶穩定 id、對外曝光清單 API（`getLines`/`onLinesChange`/`deleteLine`/`highlightLine`）供 React／側邊欄使用，並移除 drawing4 的畫布點擊選取／鍵盤刪除整條路徑（選取與刪除改由側邊欄清單 sidebar3 負責，**已於 sidebar3 接上，見 [sidebar.md](sidebar.md)**）+ **drawing7：線層級樣式 `color`/`width` 入資料結構由 renderer 讀取，主畫面 `DrawingToolbar` 提供選色 UI（畫線前選色，線畫出後顏色固定不可改）**。整體規劃見 `project-planning/design.md`。

## `TrendLinePrimitive`（`lib/chart/drawing/trendLinePrimitive.ts`）

```ts
interface TrendLinePoint {
  time: Time;
  price: number;
}

/** 線層級樣式（drawing7）。 */
interface TrendLineStyle {
  color: string;
  width: number;
}

const DEFAULT_TREND_LINE_WIDTH = 2;

class TrendLinePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType, Time> | null;
  points: [TrendLinePoint, TrendLinePoint] | null;
  selected: boolean;
  readonly style: TrendLineStyle; // 建立後不可變更

  constructor(style?: Partial<TrendLineStyle>);
  attached(param: SeriesAttachedParameter<Time>): void;
  detached(): void;
  setPoints(points: [TrendLinePoint, TrendLinePoint] | null): void;
  setSelected(selected: boolean): void;
  updateAllViews(): void;
  paneViews(): readonly IPrimitivePaneView[];
}
```

- 座標存邏輯座標 `{ time, price }` 而非 pixel。`TrendLinePaneView.update()`（`updateAllViews()` 觸發，庫在 viewport 變動時會自動呼叫）用 `chart.timeScale().timeToCoordinate()` + `series.priceToCoordinate()` 即時換算成 pixel 座標，確保縮放/resize/pan 後線條不跑位。
- `TrendLinePaneRenderer.draw()` 用 `target.useBitmapCoordinateSpace()` + `ctx.scale(horizontalPixelRatio, verticalPixelRatio)` 畫線。**drawing7 起色寬改讀該線自己的 `style`**（原本是模組級寫死的 `LINE_COLOR`/`LINE_WIDTH`）：`ctx.strokeStyle = style.color`、`ctx.lineWidth = selected ? style.width * SELECTED_WIDTH_MULTIPLIER : style.width`（`SELECTED_WIDTH_MULTIPLIER = 2`，**選取時加粗一倍**——sidebar3 人工驗證回饋原本的 +1px 太不明顯）；`selected` 為 `true` 時另在兩端畫半徑 4px 的實心圓把手（`fillStyle` 亦用該線自己的 `color`），作為高亮視覺提示。
- **`style` 於 constructor 決定後即固定**（欄位為 `readonly`，沒有 setter）：`new TrendLinePrimitive({ color })` 由 `DrawingController` 在建立預覽線當下帶入目前選色，未指定的欄位取預設 `{ color: DEFAULT_DRAWING_LINE_COLOR, width: DEFAULT_TREND_LINE_WIDTH }`。預設色 `DEFAULT_DRAWING_LINE_COLOR = '#f5a623'` 集中在共用色票 [`lib/chart/colors.ts`](../web/src/lib/chart/colors.ts)（與 indicator8 抽出的 `UP_COLOR`/`DOWN_COLOR`/`DEFAULT_LINE_COLOR` 同一份）。`width` 目前只有預設值 2、**沒有任何 UI 入口**，僅入結構供 renderer 讀取與日後擴充。
- 純渲染邏輯，跟互動方式（拖曳）無關，只負責依 `points`/`selected`/`style` 畫線。`selected` 這個視覺狀態在 drawing6 後改由 `DrawingController.highlightLine(id)`（側邊欄清單 hover／選取）驅動，而非畫布點擊。
- 每條線各自是獨立的 `TrendLinePrimitive` 實例，由 `DrawingController` 建立、`attachPrimitive()`/`detachPrimitive()` 掛載與卸載。
- **drawing4 的 `hitTest(x, y)` 已於 drawing6 移除**：畫布點擊命中判定（連同 `distanceToSegment`／`HIT_TEST_TOLERANCE_PX = 6`px 容差）原本供畫布點擊選取用，drawing6 移除整條點擊選取路徑後不再需要，一併刪除，消解了「命中容差太小」技術債。

## `DrawingController`（`lib/chart/drawing/drawingController.ts`）

```ts
interface DrawingControllerOptions {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  container: HTMLElement;
}

/** 對外曝光的單條畫線資料（drawing6，供 React／側邊欄檢視與操作）。 */
interface DrawnLine {
  id: string;
  points: readonly [TrendLinePoint, TrendLinePoint] | null;
  color: string; // drawing7，唯讀快照
  width: number; // drawing7，唯讀快照
}

class DrawingController {
  constructor(options: DrawingControllerOptions);
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  clearAll(): void;
  dispose(): void;

  // --- 清單 API（drawing6，供 React／側邊欄 sidebar3 使用） ---
  getLines(): DrawnLine[];
  onLinesChange(listener: (lines: DrawnLine[]) => void): () => void; // 回傳取消訂閱函式
  deleteLine(id: string): void;
  highlightLine(id: string | null): void;

  // --- 顏色 API（drawing7） ---
  setDrawingColor(color: string): void; // 只影響「之後才開始畫」的線
  getDrawingColor(): string;
}
```

`ChartContainer.tsx` 在建立 chart/series 後即 `new DrawingController({ chart, series: candlestickSeries, container })`（存進**內部** ref），`drawingMode` prop 變動時呼叫 `setEnabled()`、`drawingColor` prop 變動時呼叫 `setDrawingColor()`、`stockNo` prop 變動時呼叫 `clearAll()`，元件卸載時呼叫 `dispose()`。

### `ChartContainer` 對 React 曝光的介面（sidebar3）

`DrawingController` **不直接交給 `App`**，只透過三個窄介面往外接（`components/chart/ChartContainer.tsx`）：

```tsx
/** 圖表的指令式介面：只曝光側邊欄真正需要的操作。share2 還原線條時在此加 addLine()。 */
export interface ChartHandle {
  deleteLine(id: string): void;
}

<ChartContainer
  ref={chartRef}                       // useImperativeHandle 綁定 ChartHandle（React 19 ref-as-prop）
  onLinesChange={handleLinesChange}     // (lines: DrawnLine[]) => void
  highlightedLineId={selectedLineId}    // string | null，轉呼叫 highlightLine()
  …
/>
```

- `onLinesChange`：訂閱前先同步一次 `getLines()` 快照（避免訂閱建立前已畫的線沒進清單），effect 的 cleanup 就是 `onLinesChange()` 回傳的 unsubscribe。**呼叫端需以 `useCallback` 給穩定身分**，否則每次 render 都會重新訂閱。
- `highlightedLineId`：值變動時呼叫 `controller.highlightLine(id)`，`null` 取消高亮。
- 圖表尺寸：`createChart` 用 `autoSize: false` + 自管 `ResizeObserver`（跟著容器實際尺寸走）。側邊欄是覆蓋在圖表上的，收合不改變容器尺寸、也不需要 resize（見 [sidebar.md](sidebar.md)）。

### 清單 API（drawing6）

`DrawingController` 內部把每條已定案的線存成 `{ id, primitive }`（`ManagedLine`），id 為 `line-${seq}`（session 內單調遞增、刪除後不重用，確保穩定）。曝光給 React／側邊欄的四個方法：

- `getLines()`：回傳目前所有**已定案**線條的快照（`{ id, points, color, width }`，`points` 為邏輯座標 `time`/`price`；`color`/`width` 為 drawing7 加入的線層級樣式），不含拖曳中未放開的 `activeLine`。
- `onLinesChange(listener)`：訂閱線清單變化，回傳取消訂閱函式（內部以 `Set<listener>` 管理，支援多個訂閱者）。**畫線放開定案、`deleteLine()`、`clearAll()`** 三種會改變清單的操作都會以最新快照觸發所有 listener；純點擊（沒拖出線）與 `highlightLine()`（純視覺）不觸發。
- `deleteLine(id)`：刪除指定 id 的線（`splice` 移除 + `series.detachPrimitive()` 卸載），只影響該條，其餘不受影響；找不到 id 則 no-op（不 detach、不觸發 `onLinesChange`）。若刪的是目前高亮中的線，內部高亮狀態一併重置。
- `highlightLine(id | null)`：高亮指定 id 的線（沿用 `TrendLinePrimitive.setSelected(true)` 的加粗＋端點把手視覺），傳 `null` 取消高亮；相同目標重複呼叫為 no-op。高亮與畫線模式（`setEnabled`）獨立，非畫線模式下也可高亮。
- `dispose()`：`setEnabled(false)` + `clearAll()` 之外，額外 `linesChangeListeners.clear()` 清掉所有訂閱者。

### 線條顏色（drawing7）

**顏色必須在畫線前指定，線一旦開始畫就固定、之後不可更改**——這是產品決策：實測（drawing4/drawing6）確認在畫布上精準選中單一線條的操作成本過高，因此不提供「選取某線後改色」的路徑。

- `DrawingController` 內部有一個 `drawingColor` 欄位（初始值 `DEFAULT_DRAWING_LINE_COLOR`），`setDrawingColor(color)` 只更新這個欄位、**不碰任何既有的 primitive**。
- 顏色在 `onCrosshairMove` **第一次移動建立預覽線的當下**由 `new TrendLinePrimitive({ color: this.drawingColor })` 帶入並固定。因此拖曳途中改色也不影響正在畫的那條，只有之後才開始畫的線會吃到新顏色。
- 沒有 `setLineColor()` 之類的 API，`TrendLinePrimitive.style` 也是 `readonly`：不可事後改色這件事同時由 API 面與型別面保證。
- 每條線各自持有自己的 `style`，互不影響；顏色是純記憶體狀態，跟 `points` 一樣不持久化，`clearAll()`（切股）後一併消失。

### 按下拖曳互動（桌面與行動統一）

- **開啟（`setEnabled(true)`）**：`chart.applyOptions({ handleScroll: false, handleScale: false, crosshair: { mode: CrosshairMode.Normal }, trackingMode: { exitMode: TrackingModeExitMode.OnTouchEnd } })` 關閉原生 pan/zoom（含觸控），並在 `container` 上掛原生 `mousedown`/`touchstart`/`touchmove`/`touchend`/`touchcancel` 監聽器，`window` 上掛 `mouseup`，並 `chart.subscribeCrosshairMove()`。drawing5 觸控驗證發現並修正了兩個各自獨立、疊加造成偏移的問題：
  1. **crosshair Magnet 吸附**（第一輪修正）：lightweight-charts 預設 `CrosshairMode.Magnet` 會把 `subscribeCrosshairMove` 回傳的座標吸附到當下時間點最近那根 K 棒的**收盤價**，而非滑鼠/手指的原始座標；`onCrosshairMove` 直接拿這個座標當拖曳終點，會跟用原始座標算的起點（見下）不一致，造成拖出的線終點偏移到收盤價位置（長上下影線的 K 棒上偏移量明顯，十字星上幾乎為零）。改成 `CrosshairMode.Normal` 解決。
  2. **trackingMode 跨手勢殘留**（第二輪修正，影響更大）：觸控長按拖曳依賴 lightweight-charts 內建的 tracking mode，其 `trackingMode.exitMode` 預設是 `OnNextTap`——放開手指（touchend）並不會真正結束 tracking mode，要等到下一次「單純點擊（非拖曳）」才會結束。畫線模式每次操作都是「長按→拖曳→放開」，中間從未插入單純點擊，導致 tracking mode 從頭到尾沒斷過：第二條線起，庫內部的 `touchStartEvent` 偵測到 tracking mode 還在，不會用這次觸點當基準，而是把「上一條線放開當下的 crosshair 座標」當成新的追蹤基準點，後續 `touchMoveEvent` 用「基準點 +（目前觸點－這次 touchstart 座標）」的差值疊加公式算座標，等於把上一條線結束的位置錯誤地混進這條線的計算——只有第一條線（tracking mode 全新啟動、基準點=起點=觸點本身）不受影響，第二條開始每條線的偏移還會累加放大。改成 `TrackingModeExitMode.OnTouchEnd` 讓每次放開手指就真正結束 tracking mode，下一條線的起點就是全新的 1:1 觸點座標，不再帶著前一條線的尾巴。使用者在真實觸控裝置上重新驗證確認偏移問題已解決。
- **按下**：因 chart API 沒有「按下」事件可訂閱，起點座標改用 `chart.timeScale().coordinateToTime(x)` + `series.coordinateToPrice(y)` 自行換算（`x`/`y` 為相對 `container` 的座標）；只接受 y 落在主圖（K 線）pane 高度內（`chart.panes()[0].getHeight()`）的按下，避免用量能 pane 的 y 座標誤套主圖價格軸。
- **拖曳中**：`subscribeCrosshairMove` 取得即時座標，只要處於拖曳狀態就持續更新終點畫出預覽線（第一次移動時才真正 `new TrendLinePrimitive({ color: drawingColor })` + `attachPrimitive()`，存在 `activeLine`，尚未進入 `lines` 陣列；顏色即在此刻固定，見「線條顏色」一節）。
- **放開**：`mouseup`（掛在 `window`，避免放開時游標已離開 canvas 而漏接）/`touchend`/`touchcancel` 把 `activeLine` push 進內部 `lines: TrendLinePrimitive[]` 陣列並清空 `activeLine`/`anchor`/`dragging`，該線的 `points` 維持在放開當下的座標不再更新。**每次完整拖曳都會產生一條新線**，不會覆蓋先前已定案的線（drawing1 spike 版本用單一 `trendLineRef` 會互相覆蓋，drawing2 已改為陣列管理）。
- 另掛一個 `touchmove` 監聽器（`{ passive: false }`），僅在拖曳中呼叫 `preventDefault()`，避免瀏覽器原生觸控捲動搶走拖曳手勢。
- **關閉（`setEnabled(false)`）**：`handleScroll`/`handleScale` 恢復為 `true`，`crosshair.mode` 恢復為 `CrosshairMode.Magnet`、`trackingMode.exitMode` 恢復為 `TrackingModeExitMode.OnNextTap`（還原畫線模式以外的預設手感），unsubscribe 拖曳相關的所有監聽器；若關閉當下有未定案的拖曳中的線（`activeLine`）會被捨棄（`detachPrimitive` + 不 push 進陣列），已定案的線（`lines` 陣列內）不受影響、畫面上維持顯示。**畫線模式開關不影響高亮狀態**（高亮由側邊欄透過 `highlightLine()` 獨立控制）。

### 選取與刪除：從畫布點擊改為側邊欄清單（drawing4 → drawing6）

drawing4 曾實作「畫布點擊選取 + 鍵盤 `Delete`/`Backspace` 刪除」，但實測有兩個問題：命中容差（6px）太小、桌面難以點中；觸控裝置沒有實體鍵盤、選到線也無法刪除（兩項技術債見 [`technical-debt.md`](../project-planning/technical-debt.md)）。**drawing6 移除整條畫布點擊選取路徑**，改由側邊欄清單（sidebar3）選取與刪除：

- **已移除**：`DrawingController.hitTestLines()`、`pendingSelection`/`selectedLine` 私有欄位、`setSelectedLine()`/`deleteSelectedLine()`、`window` 的 `keydown` 監聽器，以及 `TrendLinePrimitive.hitTest()`（連同 `distanceToSegment`／`HIT_TEST_TOLERANCE_PX`）。`onMouseDown`/`onTouchStart` 不再做命中判定，`endDrag()` 簡化為「若這次拖出了線就 push 進 `lines` 並觸發 `onLinesChange`，純點擊則什麼都不做」。
- **畫布點擊不再選取線段**，畫線（按下拖曳）與 pan/zoom 行為完全不受影響。
- **選取／刪除改由清單 API 提供**（見上一節「清單 API」）：側邊欄用 `getLines()` + `onLinesChange()` 顯示所有畫線，`highlightLine(id)` 高亮 hover／選取的線，`deleteLine(id)` 刪除單條。此設計桌面／觸控通用（無需在畫布上精準點選），同時消解上述兩項技術債的根因。**實際的清單 UI 已由 sidebar3 完成**（`components/sidebar/DrawingListPanel.tsx`，含選取高亮、刪除單條、折疊自動取消選取），見 [sidebar.md](sidebar.md)。

### 線條管理與清除

- `clearAll()`：捨棄未定案的 `activeLine`（如有），遍歷 `lines` 陣列逐一 `series.detachPrimitive()` 並清空陣列，同時清空高亮狀態（`highlightedLine = null`，因為原本高亮的線可能已被 detach），最後觸發 `onLinesChange`（drawing6）以最新（空）快照通知訂閱者。純記憶體狀態，不持久化，`detachPrimitive()` 是真的卸載而非隱藏，切回原本股票代號不會「復原」畫線。
- **切股清除（drawing3）**：`ChartContainer.tsx` 新增 `stockNo` prop，`useEffect(() => { drawingControllerRef.current?.clearAll(); }, [stockNo])` 在 `stockNo` 變動時呼叫 `clearAll()`；`App.tsx` 把 `stockNo` state 往下傳。因為 effect 依賴 `[stockNo]`，首次掛載時也會呼叫一次（此時 `lines` 本來就是空陣列，無副作用）。
- `dispose()`：`setEnabled(false)` + `clearAll()`，供 `ChartContainer` 卸載時呼叫，確保元件重建/卸載不殘留 primitive 或事件監聽器。

### `DrawingToolbar`（`components/chart/DrawingToolbar.tsx`，drawing7）

主畫面的畫線工具列，drawing7 從 `App.tsx` 抽出成獨立元件（依 sidebar1 規劃，畫線模式開關留在主畫面而非側邊欄）：

```tsx
<DrawingToolbar
  drawingMode={drawingMode}
  onDrawingModeChange={setDrawingMode}
  color={drawingColor}          // App 的 drawingColor state，初始值 DEFAULT_DRAWING_LINE_COLOR
  onColorChange={setDrawingColor}
/>
```

- **畫線模式開關**（`className="drawing-toggle"`）：用 `aria-pressed` 屬性反映開關狀態，`[aria-pressed='true']` 套用 `--accent`/`--accent-bg`/`--accent-border`（與 `IndicatorPanel` 既有的 accent 色系一致）+ 粗體高亮，按鈕文字同時切換為「畫線模式：開/關」。樣式隨元件搬到 `DrawingToolbar.css`（原本在 `App.css`）。
- **選色器**：`<input type="color" id="drawing-toolbar-color">` + 「線色」label（`title="畫線前選色，畫出後不可更改"`），視覺尺寸比照 `IndicatorPanel` 的線色輸入（28×22px）。`App.tsx` 的 `drawingColor` state 同時往下傳給 `DrawingToolbar`（顯示）與 `ChartContainer`（`drawingColor` prop → `setDrawingColor()`）。
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

**drawing4（選取刪除單條線）**：延續 drawing3 的作法，改用 `drawingController.test.ts` 的 unit test 驗證（同一份 Browser pane 環境限制持續存在）。這次額外讓 fake series 的 `attachPrimitive`/`detachPrimitive` 真的呼叫 primitive 的 `attached()`/`detached()`（比照真實 lightweight-charts 庫的行為），讓 `TrendLinePrimitive.hitTest()` 依賴的 `chart`/`series` 欄位在測試中也會被正確設定；並在 `timeScale()`/`series` 的 fake 補上 `timeToCoordinate`/`priceToCoordinate`（互為 `coordinateToTime`/`coordinateToPrice` 的反函式），讓命中判定用的像素座標換算與畫線時一致。涵蓋情境：純點擊（無拖曳）不會誤建新線；點選其中一條線按 `Delete` 只刪那條、`series.detachPrimitive()` 呼叫對象正確；點空白處清除選取，此時按 `Delete` 無作用；選取一條線後在別處拖出新線，原本的選取與按鍵刪除仍正確作用在原本那條線上。使用者之後在自己的真實瀏覽器手動測試確認：刪除單條線功能可正常運作，但線條容許誤差（6px）偏小、實際點擊常落空，已記錄在 [`technical-debt.md`](../project-planning/technical-debt.md#畫線選取的點擊命中容差太小實測難以選中線條) 待後續優化。

**drawing5（行動觸控人工驗證，正式部署站台）**：使用者在真實觸控裝置上對正式部署站台實測，回報三項結果：

1. 觸控拖曳建立線條：長按（觸發 lightweight-charts 內建的 tracking mode）可開始畫線，拖曳中預覽線正確跟著手指移動，放開後定案——流程本身可行；但**線條終點座標偏移過多**，且偏移會隨著連續畫多條線越畫越明顯。分兩輪修正：第一輪只切 `CrosshairMode.Normal` 解決了第一條線的吸附偏移，但使用者接續測試（畫 1→2、3→1、4→1 三條線）發現第 2、3 條線的**終點**仍明顯偏移、且偏移量遞增；進一步分析找到第二個獨立根因——`trackingMode.exitMode` 預設 `OnNextTap` 造成的跨手勢座標基準污染（詳見上一節）——改成 `TrackingModeExitMode.OnTouchEnd` 後，使用者在真實觸控裝置重新驗證確認偏移已完全解決。
2. 觸控端選取線條比桌面容易命中，但**沒有任何 UI 可以刪除選取中的單條線**——`deleteSelectedLine()` 目前只綁在 `window` 的 `keydown`（`Delete`/`Backspace`），觸控裝置沒有實體鍵盤，選到線也無法刪除。使用者確認此限制暫不處理，記錄在 [`technical-debt.md`](../project-planning/technical-debt.md#觸控裝置無法刪除選取中的單條線缺少刪除-ui) 待後續評估。
3. 縮放圖表（zoom）的線條錨定、切換股票代號後畫線自動清除，觸控環境下皆正常運作，符合 drawing2/drawing3 桌面端已驗證的行為。

**drawing6（清單 API + 移除畫布點擊選取）**：延續同一份 Browser pane canvas 環境限制（本節開頭所述），改用 `drawingController.test.ts` 的 fake-object unit test 驗證（`tsc -b` 通過、全測試 104 passed）。drawing4 那組「畫布點擊選取／鍵盤刪除」測試（測的是已移除的行為）換成 drawing6 的 8 個測試，涵蓋三項驗收：

1. `getLines()` 正確回報 id（`line-1`/`line-2`…）與邏輯座標；`onLinesChange` 在**畫線放開、`deleteLine()`、`clearAll()`** 時各以最新快照觸發一次，純點擊與 `highlightLine()` 不觸發；`onLinesChange` 回傳的 unsubscribe 能停止後續通知。
2. `deleteLine(id)` 只刪指定線（`series.detachPrimitive()` 呼叫對象正確）、反映在 `getLines()`；unknown id 為 no-op（不 detach、不通知）。`highlightLine(id)` 切換 `primitive.selected`、刪除高亮中的線後內部狀態正確重置。
3. 純點擊（`mousedown`→`mouseup` 無 crosshair move）不建線、不通知（畫布點擊選取路徑已移除）；`setEnabled` 對 pan/zoom 的處理未動，畫線與 pan/zoom 行為不受影響。

清單 API 尚未接上 UI（等 sidebar3），`ChartContainer` 的 wiring 未新增（既有 `drawingMode`/`stockNo`/`dispose` 呼叫不變）。

**drawing7（線條顏色）**：同一份 Browser pane canvas 限制持續存在，畫線行為續用 fake-object unit test 驗證（`tsc -b` 通過、`oxlint` 無警告、全測試 113 passed）。

- `trendLinePrimitive.test.ts` 新增一組樣式測試，用會記錄 `strokeStyle`/`fillStyle`/`lineWidth` 的假 canvas context 驗證 `draw()` 實際套用的值：預設樣式為 `{ '#f5a623', 2 }`；constructor 帶入 `{ color: '#ff0000', width: 5 }` 時 `strokeStyle`/`lineWidth` 即為該值（證明 renderer 讀的是線自身樣式而非模組常數）；`selected` 時 `lineWidth` 為 `width + 1 = 6`、把手 `fillStyle` 用該線顏色且 `arc()` 呼叫兩次；兩個不同顏色的 primitive 各自渲染自己的顏色（互不影響）。
- `drawingController.test.ts` 新增一組顏色測試：預設選色為 `DEFAULT_DRAWING_LINE_COLOR`；`setDrawingColor()` 後畫的新線帶新色、先前畫的線顏色不變；**拖曳中改色不影響進行中的那條，下一條才吃新色**；`getLines()` 一併曝光 `width`（預設 2）；並斷言 controller 上不存在 `setLineColor`（確保「畫完不可改色」沒有後門）。
- 瀏覽器端只做了 UI 渲染確認（dev server 開啟後 `read_page` 看到「線色」color input、`javascript_tool` 讀到其值為 `#f5a623`、console 無錯誤）；實際拖曳畫線的視覺顏色仍受限於 canvas 環境問題未在沙盒內截圖驗證。

**sidebar3（側邊欄清單接上）**：同一份 Browser pane 限制持續存在——沙盒內**無法用合成事件畫出線**（試過對 container 與所有子元素派送 `mousedown`/`mousemove`/`mouseup`，`subscribeCrosshairMove` 因 rAF 凍結不觸發），因此清單相關的端到端行為完全交由使用者在真實瀏覽器驗證，沙盒內只補純函式測試：

- `lineLabel.test.ts`（標籤只顯示編號 `#N`）、`lineSelection.test.ts`（選取切換／刪除後清除／折疊後清除）。
- `trendLinePrimitive.test.ts` 的選取測試改為驗證 `lineWidth` 為該線 `width` 的 2 倍（width 5 → 10）。
- 使用者實測確認：畫線後清單即時列出、點選高亮對應線段、刪除單條後圖上同步消失、折疊區塊／側邊欄自動取消高亮；並回饋三項已修正的調整（高亮加粗一倍、標籤移除起訖日期、側邊欄改覆蓋式）。

## 已知限制 / 尚未實作

- **線畫出後不可改色（產品決策，非限制待補）**：顏色只能在畫線前用 `DrawingToolbar` 的選色器指定；已畫出的線要換色只能刪掉重畫。原因是在畫布上精準選中單一線條的操作成本過高（drawing4 實測），刻意不提供選線改色路徑。
- **線寬 `width` 沒有 UI 入口**：drawing7 只把 `width` 加進線層級樣式供 renderer 讀取（預設 2），依任務規格暫不開放調整。
- **單條線刪除已由側邊欄清單提供（sidebar3 完成）**：drawing6 把選取／刪除從畫布點擊改為清單 API（`getLines`/`onLinesChange`/`deleteLine`/`highlightLine`）並移除舊的鍵盤 `Delete`/`Backspace` 刪除；sidebar3 接上 `DrawingListPanel` 後，桌面與觸控都能從清單刪除單條線（見 [sidebar.md](sidebar.md)）。舊有的「命中容差太小」「觸控無刪除 UI」兩項技術債至此皆已消解（見 [`technical-debt.md`](../project-planning/technical-debt.md)）。
- **線條不持久化**：`points`/`color` 都是純記憶體狀態，重新整理或切換股票代號即消失；URL 分享還原屬 share1/share2（屆時需要新增 `DrawingController.addLine()` 與 `ChartHandle` 的對應方法）。
