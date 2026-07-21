# data1 — 資料型別與 Provider Registry

## 說明

在 `web/src/lib/data/types.ts` 定義 `OhlcvBar`、`DateRange`、`FetchProgress`、`StockDataProvider` 介面（`fetchDaily(stockNo, range, onProgress, signal)` 回傳 `Promise<OhlcvBar[]>`）。在 `providers/providerRegistry.ts` 建立 provider 註冊表，供後續 TWSE/TPEx/Yahoo provider 註冊與依 id 查找。

## 依賴

infra1

## 驗收方式

1. TypeScript 編譯（`tsc --noEmit` 或 `npm run build`）通過，型別無誤。
2. 撰寫最小 unit test：註冊一個 mock provider 後能透過 registry 依 id 取回，型別符合 `StockDataProvider` 介面。
