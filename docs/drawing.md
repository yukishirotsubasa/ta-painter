# 手動畫線（`web/src/lib/chart/drawing/`、`components/chart/ChartContainer.tsx`）

> 本文件記錄**已實作**的畫線模組：`TrendLinePrimitive` 渲染機制（drawing1）+ 正式的 `DrawingController`（drawing2，模式切換、事件處理、多線陣列管理）+ 切換股票自動清除畫線（drawing3）+ 選取刪除單條線（drawing4）。整體規劃見 `project-planning/design.md`。

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
  selected: boolean;

  attached(param: SeriesAttachedParameter<Time>): void;
  detached(): void;
  setPoints(points: [TrendLinePoint, TrendLinePoint] | null): void;
  setSelected(selected: boolean): void;
  hitTest(x: number, y: number): PrimitiveHoveredItem | null;
  updateAllViews(): void;
  paneViews(): readonly IPrimitivePaneView[];
}
```

- 座標存邏輯座標 `{ time, price }` 而非 pixel。`TrendLinePaneView.update()`（`updateAllViews()` 觸發，庫在 viewport 變動時會自動呼叫）用 `chart.timeScale().timeToCoordinate()` + `series.priceToCoordinate()` 即時換算成 pixel 座標，確保縮放/resize/pan 後線條不跑位。
- `TrendLinePaneRenderer.draw()` 用 `target.useBitmapCoordinateSpace()` + `ctx.scale(horizontalPixelRatio, verticalPixelRatio)` 畫線，顏色 `#f5a623`、寬度 2px（`selected` 為 `true` 時寬度變 3px，並在兩端畫半徑 4px 的實心圓把手，作為選取視覺提示）。
- 純渲染邏輯，跟互動方式（拖曳）無關，只負責依 `points`/`selected` 畫線。
- 每條線各自是獨立的 `TrendLinePrimitive` 實例，由 `DrawingController` 建立、`attachPrimitive()`/`detachPrimitive()` 掛載與卸載。
- `hitTest(x, y)`（drawing4）：把 `points` 換算成 pixel 座標後，計算 `(x, y)` 到線段的最短距離，容許誤差 `HIT_TEST_TOLERANCE_PX = 6`px 內視為命中，供 `DrawingController` 做點擊選取判定。回傳型別依 `lightweight-charts@5.2.0` 的 `ISeriesPrimitiveBase` 介面必須是 `PrimitiveHoveredItem | null`（非單純 `boolean`）：命中回傳 `{ cursorStyle: 'pointer', externalId: 'trend-line', zOrder: 'normal' }`，未命中回傳 `null`；`DrawingController.hitTestLines()` 用 `!== null` 判斷是否命中。實測發現此容差偏小、實際點擊常常落空，已記錄在 [`technical-debt.md`](../project-planning/technical-debt.md#畫線選取的點擊命中容差太小實測難以選中線條) 待後續優化。

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

- **開啟（`setEnabled(true)`）**：`chart.applyOptions({ handleScroll: false, handleScale: false, crosshair: { mode: CrosshairMode.Normal } })` 關閉原生 pan/zoom（含觸控），並在 `container` 上掛原生 `mousedown`/`touchstart`/`touchmove`/`touchend`/`touchcancel` 監聽器，`window` 上掛 `mouseup`，並 `chart.subscribeCrosshairMove()`。crosshair 模式額外切成 `Normal`（drawing5 觸控驗證修正）：lightweight-charts 預設 `CrosshairMode.Magnet` 會把 `subscribeCrosshairMove` 回傳的座標吸附到當下時間點最近那根 K 棒的**收盤價**，而非滑鼠/手指的原始座標；`onCrosshairMove` 直接拿這個座標當拖曳終點，會跟用原始座標算的起點（見下）不一致，造成拖出的線終點偏移到收盤價位置（長上下影線的 K 棒上偏移量明顯，十字星上幾乎為零）。桌面滑鼠因為有原生十字線同步可見不易察覺，觸控時手指擋住畫面、放開瞬間線才「跳」到收盤價位置，才被使用者實測發現。
- **按下**：因 chart API 沒有「按下」事件可訂閱，起點座標改用 `chart.timeScale().coordinateToTime(x)` + `series.coordinateToPrice(y)` 自行換算（`x`/`y` 為相對 `container` 的座標）；只接受 y 落在主圖（K 線）pane 高度內（`chart.panes()[0].getHeight()`）的按下，避免用量能 pane 的 y 座標誤套主圖價格軸。
- **拖曳中**：`subscribeCrosshairMove` 取得即時座標，只要處於拖曳狀態就持續更新終點畫出預覽線（第一次移動時才真正 `new TrendLinePrimitive()` + `attachPrimitive()`，存在 `activeLine`，尚未進入 `lines` 陣列）。
- **放開**：`mouseup`（掛在 `window`，避免放開時游標已離開 canvas 而漏接）/`touchend`/`touchcancel` 把 `activeLine` push 進內部 `lines: TrendLinePrimitive[]` 陣列並清空 `activeLine`/`anchor`/`dragging`，該線的 `points` 維持在放開當下的座標不再更新。**每次完整拖曳都會產生一條新線**，不會覆蓋先前已定案的線（drawing1 spike 版本用單一 `trendLineRef` 會互相覆蓋，drawing2 已改為陣列管理）。
- 另掛一個 `touchmove` 監聽器（`{ passive: false }`），僅在拖曳中呼叫 `preventDefault()`，避免瀏覽器原生觸控捲動搶走拖曳手勢。
- **關閉（`setEnabled(false)`）**：`handleScroll`/`handleScale` 恢復為 `true`，`crosshair.mode` 恢復為 `CrosshairMode.Magnet`（還原畫線模式以外的預設吸附手感），unsubscribe 所有監聽器（含 drawing4 新增的 `keydown`）；若關閉當下有未定案的拖曳中的線（`activeLine`）會被捨棄（`detachPrimitive` + 不 push 進陣列），已定案的線（`lines` 陣列內）不受影響、畫面上維持顯示；同時清除目前的選取狀態（見下）。

### 選取與刪除單條線（drawing4）

純粹靠既有的按下拖曳事件（`mousedown`/`touchstart` → `mouseup`/`touchend`）判斷，沒有新增額外的滑鼠事件監聽器，也沒有曝光任何新的公開 API（`DrawingController` 對外介面維持 `isEnabled`/`setEnabled`/`clearAll`/`dispose` 不變，選取狀態純粹是內部私有欄位）：

- **點擊命中判定**：`mousedown`/`touchstart` 當下先用 `hitTestLines(x, y)` 對 `lines` 陣列由後往前找第一條 `TrendLinePrimitive.hitTest(x, y)` 命中的線（`hitTest` 容許誤差 6px，見上一節），存成 `pendingSelection` 候選，此時**還不會**真的選取。
- **放開時判定是拖曳還是點擊**：`endDrag()` 若 `activeLine` 有值（代表這次真的拖出了一條新線），則維持原本的選取狀態不變、捨棄 `pendingSelection`；若 `activeLine` 為空（純點擊、沒有真的拖曳），才呼叫 `setSelectedLine(pendingSelection)`——命中線就選取該線，點空白處（`pendingSelection` 為 `null`）則清除目前選取。
- **選取視覺**：`setSelectedLine()` 對舊選取線呼叫 `setSelected(false)`、新選取線呼叫 `setSelected(true)`，觸發 `TrendLinePrimitive` 重繪成加粗＋端點把手樣式（見上一節）。
- **刪除**：`setEnabled(true)` 時額外在 `window` 掛 `keydown` 監聽器；有選取中的線時按下 `Delete` 或 `Backspace`（`event.preventDefault()`）呼叫 `deleteSelectedLine()`——用 `lines.indexOf()` 找到該線在陣列中的位置 `splice` 移除，並 `series.detachPrimitive()` 卸載，只影響選取的那一條，其餘線不受影響。

### 線條管理與清除

- `clearAll()`：捨棄未定案的 `activeLine`（如有），遍歷 `lines` 陣列逐一 `series.detachPrimitive()` 並清空陣列，同時清空選取狀態（`selectedLine = null`，因為原本選取的線可能已被 detach）。純記憶體狀態，不持久化，`detachPrimitive()` 是真的卸載而非隱藏，切回原本股票代號不會「復原」畫線。
- **切股清除（drawing3）**：`ChartContainer.tsx` 新增 `stockNo` prop，`useEffect(() => { drawingControllerRef.current?.clearAll(); }, [stockNo])` 在 `stockNo` 變動時呼叫 `clearAll()`；`App.tsx` 把 `stockNo` state 往下傳。因為 effect 依賴 `[stockNo]`，首次掛載時也會呼叫一次（此時 `lines` 本來就是空陣列，無副作用）。
- `dispose()`：`setEnabled(false)` + `clearAll()`，供 `ChartContainer` 卸載時呼叫，確保元件重建/卸載不殘留 primitive 或事件監聽器。

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

**drawing4（選取刪除單條線）**：延續 drawing3 的作法，改用 `drawingController.test.ts` 的 unit test 驗證（同一份 Browser pane 環境限制持續存在）。這次額外讓 fake series 的 `attachPrimitive`/`detachPrimitive` 真的呼叫 primitive 的 `attached()`/`detached()`（比照真實 lightweight-charts 庫的行為），讓 `TrendLinePrimitive.hitTest()` 依賴的 `chart`/`series` 欄位在測試中也會被正確設定；並在 `timeScale()`/`series` 的 fake 補上 `timeToCoordinate`/`priceToCoordinate`（互為 `coordinateToTime`/`coordinateToPrice` 的反函式），讓命中判定用的像素座標換算與畫線時一致。涵蓋情境：純點擊（無拖曳）不會誤建新線；點選其中一條線按 `Delete` 只刪那條、`series.detachPrimitive()` 呼叫對象正確；點空白處清除選取，此時按 `Delete` 無作用；選取一條線後在別處拖出新線，原本的選取與按鍵刪除仍正確作用在原本那條線上。使用者之後在自己的真實瀏覽器手動測試確認：刪除單條線功能可正常運作，但線條容許誤差（6px）偏小、實際點擊常落空，已記錄在 [`technical-debt.md`](../project-planning/technical-debt.md#畫線選取的點擊命中容差太小實測難以選中線條) 待後續優化。

**drawing5（行動觸控人工驗證，正式部署站台）**：使用者在真實觸控裝置上對正式部署站台實測，回報三項結果：

1. 觸控拖曳建立線條：長按（觸發 lightweight-charts 內建的 tracking mode）可開始畫線，拖曳中預覽線正確跟著手指移動，放開後定案——流程本身可行；但**線條終點座標偏移過多**，根因即上一節所述的 `CrosshairMode.Magnet` 座標吸附問題，已在本次 session 修正（`setEnabled` 切換 crosshair 模式）。
2. 觸控端選取線條比桌面容易命中，但**沒有任何 UI 可以刪除選取中的單條線**——`deleteSelectedLine()` 目前只綁在 `window` 的 `keydown`（`Delete`/`Backspace`），觸控裝置沒有實體鍵盤，選到線也無法刪除。使用者確認此限制暫不處理，記錄在 [`technical-debt.md`](../project-planning/technical-debt.md#觸控裝置無法刪除選取中的單條線缺少刪除-ui) 待後續評估。
3. 縮放圖表（zoom）的線條錨定、切換股票代號後畫線自動清除，觸控環境下皆正常運作，符合 drawing2/drawing3 桌面端已驗證的行為。

## 已知限制 / 尚未實作

- **觸控裝置無法刪除選取中的單條線**：`DrawingController` 刪除邏輯只綁在 `window` 的 `keydown`（`Delete`/`Backspace`，見上）,觸控裝置沒有鍵盤可觸發，目前選取後沒有任何替代 UI（按鈕/手勢）可以刪除該線。drawing5 觸控實測發現後使用者確認暫不修，詳見 [`technical-debt.md`](../project-planning/technical-debt.md#觸控裝置無法刪除選取中的單條線缺少刪除-ui)。
- **選取的點擊命中容差偏小**：目前 `HIT_TEST_TOLERANCE_PX = 6`px，真實瀏覽器實測反映難以點中線條；改善方向見 [`technical-debt.md`](../project-planning/technical-debt.md#畫線選取的點擊命中容差太小實測難以選中線條)。
