# indicator17 — ATR 真實波幅指標

## 說明

新增 `web/src/lib/chart/indicators/atr.ts`：`id: 'atr'`、`urlCode: 'at'`、`placement: 'separate-pane'`。

- 匯出 `trueRange(bars): number[]`（長度同 bars）：TR = max(高−低, |高−前收|, |低−前收|)，第一根沒有前收盤價，退化為當日高低差。**DMI（indicator18）會重用這個函式**，故對外匯出。
- 參數：`period`（預設 14）、`color`。`compute()` = `wilderRma(trueRange(bars), period)`。
- `mount()`：配置一個新 pane（ATR 是絕對波動幅度，沒有固定值域，不加參考線）。

## 依賴

indicator12

## 驗收方式

1. `trueRange()` 在跳空向上／向下的情境分別取到 |高−前收| 與 |低−前收|，首根取高低差。
2. ATR 恆非負，且高波動序列的 ATR 高於低波動序列。
3. 資料不足 period 天不輸出。
