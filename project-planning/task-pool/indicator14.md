# indicator14 — EMA 指數移動平均指標

## 說明

新增 `web/src/lib/chart/indicators/ema.ts`：`id: 'ema'`、`urlCode: 'em'`、`placement: 'overlay'`。

- 參數：`period`（週期，預設 12，1–240）、`source`（計算來源 enum，與 MA 共用 `priceSource.ts`）、`color`（線色）。
- `compute()` 用 `movingAverage.ts` 的 `ema()`（種子為前 period 筆 SMA，`k = 2/(period+1)`），資料不足 period 天不輸出。
- `mount()` 與 `ma.ts` 同一套 pane 規則：價格類來源掛主圖 pane 0、`source=volume` 掛量能 pane 1 並用 volume 數字格式，來源在價格↔成交量之間切換時 `moveToPane()`。

## 依賴

indicator12

## 驗收方式

1. `compute()` 結果與共用 `ema()` helper 一致，且對同一段資料比同週期 SMA 更快貼近新價。
2. `source=volume` 掛在量能 pane、價格來源掛主圖 pane，色值在 mount 與 update 皆套用。
3. 分享連結以 `em` 短代碼編解碼，與 MA 的 `ma` 不衝突。
