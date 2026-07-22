# indicator7 — MA 計算來源與顏色可調

## 說明

MA 指標（`web/src/lib/chart/indicators/ma.ts`）`paramsSchema` 追加 `source` enum（close/open/high/low/volume，預設 close）與 `color`（color type，預設沿用現行線色）。`computeMa` 依 `source` 取對應欄位（現況寫死 `bar.close`），使 MA 可對 volume 或其他價格計算。`mount()` 依 `color` 參數設定線色（現況 `addSeries(LineSeries, {}, 0)` 用預設色）。

## 依賴

indicator6

## 驗收方式

1. MA `source` 選 volume 時，MA 線依成交量計算（可與量能子 pane 對照趨勢）。
2. `source` 選 close 時數值與原本一致。
3. 調整 `color` 參數即時改變 MA 線顏色；多條 MA 可各設不同色。
