# 手動畫線（`web/src/lib/chart/drawing/`、`components/chart/ChartContainer.tsx`）

> 本文件記錄**已實作**的畫線 spike（drawing1）：`TrendLinePrimitive` 渲染機制 + `ChartContainer` 裡的按下拖曳 demo。正式的 `DrawingController`（模式切換封裝、多線管理、切股清除）尚未實作，屬 drawing2/drawing3/drawing4 範圍，屆時本文件會再更新。整體規劃見 `project-planning/design.md`。

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
- 呼叫端（`ChartContainer`）用 `series.attachPrimitive(instance)` 掛上、`setPoints()` 更新兩個端點；`points` 設為 `null` 或呼叫 `detached()` 都不會畫線。
- 純渲染邏輯，跟互動方式（點擊或拖曳）無關，兩者都只是呼叫 `setPoints()`。

## 按下拖曳互動（`ChartContainer.tsx` 的 `drawingMode` prop）

`<ChartContainer data={bars} indicators={indicators} drawingMode={boolean} />`，`App.tsx` 有一顆「畫線模式：開/關」按鈕切換此 prop 做 demo。

- **開啟時**：`chart.applyOptions({ handleScroll: false, handleScale: false })` 關閉原生 pan/zoom（含觸控），並在 `containerRef` 上掛原生 `mousedown`/`touchstart` 監聽器。
- **按下**：因 chart API 沒有「按下」事件可訂閱，起點座標改用 `chart.timeScale().coordinateToTime(x)` + `series.coordinateToPrice(y)` 自行換算（`x`/`y` 為相對 `containerRef` 的座標）；只接受 y 落在主圖（K 線）pane 高度內（`chart.panes()[0].getHeight()`）的按下，避免用量能 pane 的 y 座標誤套主圖價格軸。
- **拖曳中**：用 `chart.subscribeCrosshairMove()` 取得目前座標，只要處於拖曳狀態就持續 `trendLineRef.current.setPoints([anchor, current])` 更新預覽線（第一次移動時才真正 `new TrendLinePrimitive()` + `attachPrimitive()`）。
- **放開**：`mouseup`（掛在 `window`，避免放開時游標已離開 canvas 而漏接）/`touchend`/`touchcancel` 重置拖曳狀態，`points` 維持在放開當下的座標，不再更新。
- 另掛一個 `touchmove` 監聽器（`{ passive: false }`），僅在拖曳中呼叫 `preventDefault()`，避免瀏覽器原生觸控捲動搶走拖曳手勢。
- **關閉時**：`handleScroll`/`handleScale` 恢復為 `true`，unsubscribe 所有監聽器；目前畫出的線不會被清除（`trendLineRef` 持續存在，切股清除是 drawing3 的範圍）。
- 目前同一時間只維護**一條線**（`trendLineRef` 是單一 ref，非陣列），重新拖曳會覆蓋掉舊的端點；多線管理是 drawing4 的範圍。

## 手動驗證紀錄

因 sandbox 網路限制與 Claude Code Browser 預覽面板本身的截圖/canvas resize 異常（環境限制，非本專案程式碼問題），前段驗證改用 `javascript_tool` 對真實 `IChartApi`/`ISeriesApi` 實例做白盒驗證（seed 合成 K 線資料，因無法連外抓 TWSE 真實資料）：

- 按下（`mousedown`）正確用 `coordinateToTime`/`coordinateToPrice` 算出起點 time/price，此時尚未建立 primitive。
- 拖曳中（`mousemove` + `buttons:1` 觸發 `subscribeCrosshairMove`）第一次移動即建立並 `attachPrimitive`，之後每次移動 `points` 的終點正確跟著更新，全程無 console error。
- 放開（`mouseup`）後 `points` 維持在放開當下座標；之後純 hover（`buttons:0`）不再改變 `points`。
- 對同一個 `trendLineRef` 重新拖曳一次，`points` 正確更新為新的起訖點。
- 畫線模式開啟時對 canvas 做一次完整平滑拖曳手勢，`chart.timeScale().getVisibleLogicalRange()` 拖曳前後完全不變（pan 被擋下）；關閉畫線模式後同一組手勢會正常平移圖表。

使用者另外在自己的真實瀏覽器（非本機沙盒環境）手動測試並提供畫面截圖，確認：

- K 線／成交量／價格軸／指標按鈕正常渲染，canvas resize 正常（推翻了先前懷疑「canvas backing store 卡在預設尺寸」是程式碼問題的可能性，判定純屬 Claude Code Browser 預覽面板該次 session 的環境限制）。
- 拖曳畫出的趨勢線顏色（`#f5a623`）、走向與拖曳軌跡一致，視覺上正確渲染。

## 已知限制 / 尚未實作

- **行動觸控**：拖曳建立起點的邏輯（`touchstart`）不依賴庫內部事件轉換，風險較低；但「拖曳中 `subscribeCrosshairMove` 對 `touchmove` 的即時反應」尚未實測。集中驗證見 [drawing5](../project-planning/task-pool/drawing5.md)，須在正式部署站台上進行。
- **正式 `DrawingController`**：目前互動邏輯直接寫在 `ChartContainer.tsx` 的 `useEffect` 裡，屬 spike/demo 性質；`drawing2` 會把這段邏輯抽成獨立的 `DrawingController.ts`。
- **多線管理**：目前只能維護一條線（新拖曳會覆蓋舊線），無法選取/刪除單條線；見 `drawing4`。
- **切股清除**：切換股票代號目前不會清除已畫的線；見 `drawing3`。
- **畫線模式視覺提示**：目前只有文字按鈕（「畫線模式：開/關」），未有更明顯的高亮提示；`drawing2` 驗收方式已列入。
