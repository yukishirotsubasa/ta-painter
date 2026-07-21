# indicator1 — Indicator Registry 架構

## 說明

在 `lib/chart/indicators/types.ts` 定義 `IndicatorParamSchema`、`IndicatorInstance`、`IndicatorDefinition`（含 `compute(bars, params)` 純函式與 `mount(chart, paneIndexAllocator, bars, params)` 副作用函式）。在 `registry.ts` 建立 `Map<string, IndicatorDefinition>` 註冊表與 `registerIndicator()` API。這是後續所有指標與 UI 動態產生指標清單/參數表單的核心架構，未來新增指標只需新增檔案註冊，不得在 UI 元件內寫死指標清單。

## 依賴

chart1

## 驗收方式

1. 撰寫 unit test：用一個 mock 指標定義（例如簡單 compute 回傳固定值）驗證 `compute()` 是純函式（相同輸入回傳相同輸出，不依賴外部狀態）。
2. 驗證 registry 註冊/查詢/列舉 API 正常運作。
3. TypeScript 型別檢查通過。
