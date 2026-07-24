# indicator19 — OBV 能量潮指標

## 說明

新增 `web/src/lib/chart/indicators/obv.ts`：`id: 'obv'`、`urlCode: 'ob'`、`placement: 'separate-pane'`。

- 參數只有 `color`（OBV 沒有週期，看的是累積曲線與股價的背離）。
- `compute()`：收盤價較前一日上漲則累加當日成交量、下跌則扣除、持平不變，第一根從 0 起算，**每根 K 棒都有值**（無暖身期）。
- `mount()`：配置一個新 pane，`priceFormat: { type: 'volume' }`（累積量的數量級與價格無關）。

## 依賴

indicator12

## 驗收方式

1. 漲/跌/持平三種情況的累加、扣除、不變皆與手算一致。
2. 輸出點數等於 bars 數量（沒有暖身期）。
3. `paramsSchema` 只有 `color` 一個參數。
