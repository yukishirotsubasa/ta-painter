# indicator12 — 抽出指標共用計算與價格來源 helper

## 說明

MA/布林通道/MACD 三個指標各自內嵌了滑動視窗平均、EMA 遞迴、「計算來源」選項與 pane 配置的實作。新增 11 個常見指標（indicator14–22）與頭底分析（indicator23）之前先把這些共用邏輯抽出，避免每個新指標各寫一份。

新增檔案（皆為純函式，行為與現況完全一致）：

- `web/src/lib/chart/indicators/movingAverage.ts`
  - `sma` / `ema`（自 `macd.ts` 的 `computeEmaSeries` 移出）/ `wilderRma`（`k = 1/period`，RSI/ATR/DMI 用）/ `rollingMax` / `rollingMin`。
  - 統一對齊規則：回傳陣列第 0 筆對齊 `values[period - 1]`，資料不足回空陣列。
- `web/src/lib/chart/indicators/priceSource.ts`
  - 自 `ma.ts` 移出 `PRICE_SOURCE_OPTIONS` / `PriceSource` / `resolveSource()` / `sourceValues()` / `paneIndexForSource()` / `seriesOptionsForSource()`，供 MA 與 EMA 共用。
- `web/src/lib/chart/indicators/referenceLines.ts`
  - `createReferenceLines(series, levels, color?)`，內部用 `series.createPriceLine()`/`removePriceLine()`，供 RSI/KD/CCI/%R/BIAS/ROC/DMI 的超買超賣線共用。色值為 `colors.ts` 新增的 `REFERENCE_LINE_COLOR`。
- `web/src/lib/chart/indicators/testFakeChart.ts`
  - **僅供測試**的 fake chart/allocator（涵蓋 `addSeries`/`removeSeries`/`panes`/`setData`/`applyOptions`/`getPane`/`moveToPane`/`createPriceLine`/`removePriceLine`/`attachPrimitive`/`detachPrimitive`），取代每個指標測試各自複製一份 fake。

`ma.ts` / `bollinger.ts` / `macd.ts` 改為引用這些 helper。

## 依賴

-

## 驗收方式

1. `ma.test.ts` / `bollinger.test.ts` / `macd.test.ts` **完全不修改**且全數通過（重構未改行為的證明）。
2. `movingAverage.test.ts` 涵蓋 SMA/EMA/Wilder RMA 的數值、三者共同的對齊契約與資料不足邊界。
3. `npm run typecheck`、`npm run lint` 通過。
