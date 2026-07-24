# 滑鼠 tooltip（`web/src/lib/chart/tooltip.ts` + `components/chart/ChartContainer.tsx`）

> 本文件記錄**已實作**的圖表滑鼠 tooltip（chart6）：滑鼠指到某一天時，於圖表內彈出白色資訊框，顯示該日日期、K 線 OHLC（中文）、成交量與所有指標的當日值。

## 為什麼自建 overlay

lightweight-charts v5 **沒有 tooltip formatter API**——內建 crosshair 只在座標軸邊緣顯示價格／日期標籤，不提供資訊框。因此自建一個命令式 HTML overlay：mount 時建一個 `.chart-tooltip` div append 進 `.chart-container`，`chart.subscribeCrosshairMove(param)` 每次移動時更新內容與位置。採命令式 DOM（非 React state），與 `DrawingController` 一致，避免每次 mousemove 觸發 React 重繪。

## 取值原理：不重算，讀 `param.seriesData`

crosshair 事件的 `param.seriesData` 是一個 `Map<ISeriesApi, 當日資料>`，涵蓋**所有 pane 的所有 series** 在該時間點的值（lightweight-charts 已算好、已對齊各自座標軸精度）。tooltip 只需要各 series 的參考，就能 `param.seriesData.get(series)` 取當日值——**指標值一律不在 tooltip 端重算**。

- K 線與成交量 series 參考本來就在 `ChartContainer` 手上（`candlestickSeriesRef` / `volumeSeriesRef`）。
- 指標 series 參考原本封在 `IndicatorMountHandle` 內、外部拿不到。chart6 為此在 `IndicatorMountHandle` 加**選用**的 `tooltipRows?()`，讓每個 handle 交出自己的 `IndicatorTooltipRow[]`（`{ label, color, series }`）。見 [`indicators.md`](indicators.md)。

## 純函式 `buildTooltipModel()`（`tooltip.ts`）

```ts
function buildTooltipModel(
  param: MouseEventParams,
  sources: { candlestickSeries; volumeSeries; indicatorRows: IndicatorTooltipRow[] },
): TooltipModel | null   // { date, rows: { label, value, color? }[] }
```

- `param.time` 或 `param.point` 缺（游標不在資料點上）→ 回 `null`，呼叫端據此隱藏。所有 series 皆無值（如空白區）→ 也回 `null`。
- **OHLC 中文化**：label 沿用 `indicators/priceSource.ts` 的 `PRICE_SOURCE_OPTIONS`（`開盤價／最高價／最低價／收盤價／成交量`），不重複定義。順序為開→高→低→收。值用 `candlestickSeries.priceFormatter().format()`（對齊價格軸精度）。
- **成交量**：完整千分位 `Math.round(v).toLocaleString('en-US')`（例 `84,647,010`），刻意**不用** lightweight-charts volume 格式的 K/M 縮寫。
- **指標列**：逐一 `param.seriesData.get(row.series)`，有 `value` 才輸出；值用 `row.series.priceFormatter().format()`（各線自己的精度，如 MA `1,854.5`）。**逐點自帶色**（SAR 多空分色、MACD 柱漲跌色，資料點帶 `color`）優先於指標線色 `row.color`。
- `date`：日線 time 為 `'YYYY-MM-DD'` 字串，格式成 `'YYYYMMDD'`；非字串型退回 `String(time)`。

以純函式抽離、用假的 `param`／`series`（僅需 `priceFormatter().format()`）物件寫 vitest（`tooltip.test.ts`，8 例），繞開 canvas 測不了的限制。

## 接線與定位（`ChartContainer.tsx`）

- `indicatorsRef` 每次 render 同步最新 `indicators`（crosshair 訂閱只建立一次，透過 ref 讓 handler 讀到最新清單與**順序**，避免 mount-once 閉包抓舊值）。
- handler 依 `indicatorsRef.current`（＝圖例順序）走訪 `mountedIndicatorsRef`，攤平各 handle 的 `tooltipRows?.()` 成 `indicatorRows`，呼叫 `buildTooltipModel`；`null` 則隱藏，否則以 DOM 節點（非 innerHTML，label/value 一律 `textContent`，天然免跳脫）重建內容並定位。
- `positionTooltip`：預設擺游標右下、留 12px 間距；貼近右／下緣時翻向左／上，並夾在容器內。
- cleanup 內 `unsubscribeCrosshairMove` 並移除 div。

## 樣式（`ChartContainer.css`）

`.chart-container` 加 `position: relative` 作為定位脈絡。`.chart-tooltip` 為白底深字圓角卡片（`pointer-events: none` 不擋畫線與 crosshair、`z-index: 3`、預設 `display: none` 由 JS 切換）；每列有色點 `.chart-tooltip-dot`（無色的 OHLC／成交量列保留透明點以對齊左緣）、label 與右對齊的 `.chart-tooltip-value`（`tabular-nums`）。

## 已知限制 / 尚未實作

- crosshair→tooltip 的 React 接線與 lightweight-charts 內部 crosshair 觸發，在 sandbox 的 Browser pane 無法驗證（canvas 不 compositing、合成 `mousemove` 不觸發 `subscribeCrosshairMove`）。純函式 `buildTooltipModel` 有單元測試涵蓋、白框 CSS 呈現以 computed style 確認，實際 hover 效果需本機 `npm run dev` 肉眼複測。記於 [`technical-debt.md`](../project-planning/technical-debt.md)。
- 成交量來源的指標（OBV）沿用其 series 的 volume 格式（會 K/M 縮寫），與主圖成交量列的完整千分位不同——刻意讓各列對齊各自 pane 的座標軸。
