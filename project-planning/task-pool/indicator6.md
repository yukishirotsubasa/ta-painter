# indicator6 — 指標參數 schema 型別化

## 說明

擴充 `web/src/lib/chart/indicators/types.ts` 的 `IndicatorParamSchema`，加入 `type: 'number' | 'enum' | 'color'`（現況只有數值型，隱含 number）；`enum` 需附選項清單（value/label）。`IndicatorParamValues` 由 `Record<string, number>` 改為 `Record<string, number | string>`（color/enum 為 string）。改 `IndicatorPanel.tsx`（現況只產 `<input type="number">`）依 `type` 渲染對應輸入元件：number → number input、enum → select、color → color picker。`addIndicator` 產生預設值邏輯沿用 `default`。此為 indicator7/8 前置，不改變既有 MA/布林/MACD 行為（維持只用 number 參數）。

## 依賴

無。

## 驗收方式

1. 型別擴充後既有 MA/布林/MACD 指標仍正常運作、參數面板照舊。
2. 以 unit test 或新增一個含 enum/color 參數的測試指標，驗證 `IndicatorPanel` 正確渲染 select/color 並回寫值。
3. `IndicatorParamValues` 型別變更後專案 `tsc -b` 通過。
