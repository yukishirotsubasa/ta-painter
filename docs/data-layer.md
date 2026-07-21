# 資料層（`web/src/lib/data/`）

> 本文件記錄**已實作**的資料層行為。尚未實作的來源（TPEx/Yahoo，見 `project-planning/task-pool/data5.md`、`data6.md`）不在此文件範圍內，規劃中的整體設計見 `project-planning/design.md`。

## 統一介面（`types.ts`）

```ts
interface OhlcvBar {
  time: string;   // 'YYYY-MM-DD'，對齊 lightweight-charts BusinessDay string 格式
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DateRange {
  start: string; // 'YYYY-MM-DD' 西元年
  end: string;
}

interface StockDataProvider {
  readonly id: string;
  readonly label: string;
  fetchDaily(
    stockNo: string,
    range: DateRange,
    onProgress?: FetchProgressCallback,
    signal?: AbortSignal,
  ): Promise<OhlcvBar[]>;
}
```

所有資料來源（目前只有 TWSE）都實作 `StockDataProvider`，由 `providers/providerRegistry.ts` 的 `registerProvider()`/`getProvider()`/`listProviders()` 管理。Provider 模組在載入時以 side-effect 方式自行呼叫 `registerProvider()`（見 `twseProvider.ts` 最後一行），呼叫端只要 `import` 該檔案即可完成註冊，不需另外手動註冊。

## `TwseProvider`（`providers/twseProvider.ts`）

- 直連 `https://www.twse.com.tw/exchangeReport/STOCK_DAY`，該端點回應帶 `access-control-allow-origin: *`，瀏覽器可直接 `fetch`，不需 CORS proxy。
- `date` 查詢參數只決定**查詢月份**，一次呼叫回傳整個月的資料，與 `range.end` 無關（`range.end` 只用來過濾回傳結果，見下）。
- 回應日期為民國年格式（如 `113/09/02`），`parseRocDate()` 轉為西元年 `YYYY-MM-DD`。
- 回傳的 `data` 依 `range.start`/`range.end` 過濾並依時間排序後才回傳（見 `fetchDaily` 內的 `.filter().sort()`）。
- `stat !== 'OK'` 或 HTTP 非 2xx 一律 `throw`。

## 逐月節流查詢（`throttle.ts` — `fetchDailyRange`）

`fetchDailyRange(provider, stockNo, range, onProgress?, signal?)` 是實際查詢長區間資料的入口（`App.tsx` 呼叫這個，而不是直接呼叫 provider）：

1. 依 `range` 展開成 `'YYYY-MM'` 月份清單（`listMonths`），起訖月皆含、無缺漏無重複。
2. 逐月循序處理，每個月：
   - 先呼叫 `cache.getCachedMonth(provider.id, stockNo, monthLabel)`；命中就直接用快取資料，**不打網路、不節流等待**。
   - 未命中則以**整月**範圍（`fullMonthRange`，非裁切過的查詢區間）呼叫 `provider.fetchDaily()`，並把整月結果寫入快取（`cache.setCachedMonth`）——之所以查整月而非裁切區間，是為了讓同一個月被不同查詢區間命中時，快取內容仍然完整可重用。
   - 無論來源是快取或網路，取得的整月資料最後都會依原始 `range` 裁切（`clipToRange`）後才併入回傳結果，確保回傳範圍精確符合呼叫端要求的區間。
   - 每次月與月之間若**真的發送了網路請求**，才等待 300–500ms 隨機節流（若該月是快取命中，不等待，因此重查已快取區間會明顯變快）。
   - 每完成一個月呼叫一次 `onProgress({ loaded, total, message })`。
3. 支援 `AbortSignal`：呼叫前或等待節流期間偵測到 `signal.aborted` 會立即中止並 reject `AbortError`，不會再發送後續請求。

## localStorage 快取（`cache.ts`）

- Key 格式：`` ohlcv:{providerId}:{stockNo}:{YYYYMM} ``，儲存內容為該月**完整**的 `OhlcvBar[]`（未依查詢區間裁切）。
- 索引：`cache:index` 存一個 `{ key, lastAccess }[]` 陣列，每次讀取命中（`getCachedMonth`）或寫入（`setCachedMonth`）都會更新對應項目的 `lastAccess`。
- **當月資料一律視為過期**：`getCachedMonth`/`setCachedMonth` 內部用 `currentMonthLabel()`（依實際系統時間算出的 `'YYYY-MM'`）判斷，若查詢的月份等於當月，讀取一律回傳 `undefined`（強制重抓），寫入也直接跳過不快取——避免月中抓到的不完整資料被誤當成「已完結的歷史月份」永久快取下來。
- **LRU 淘汰**：`MAX_CACHE_ENTRIES`（目前 500）為容量門檻，`setCachedMonth` 寫入後若索引筆數超過門檻，依 `lastAccess` 由舊到新淘汰多出的筆數（`evictIfNeeded`），從 `localStorage` 移除對應 key 並更新索引。
- 對 `localStorage` 不存在（例如非瀏覽器環境）或操作拋錯（如 quota 超限）的情況做了防呆：讀取回傳 `undefined`、寫入靜默略過，不會讓呼叫端因為快取層失敗而整個查詢中斷。
- 目前沒有自動化測試涵蓋「瀏覽器 Network 面板無重複請求」與「LRU 真的淘汰最舊資料」這兩項屬於 [data4](../project-planning/task-pool/data4.md) 驗收方式的第 1、3 點——這兩點在單元測試（`cache.test.ts`、`throttle.test.ts`）中改以程式邏輯驗證（mock `localStorage`、確認 provider 不被重複呼叫、確認淘汰的是最舊項目），未在真實瀏覽器手動複測過。

## 已知限制 / 尚未實作

- `TpexProvider`、`YahooProvider` 尚未實作（見 [data5](../project-planning/task-pool/data5.md)、[data6](../project-planning/task-pool/data6.md)），目前 `App.tsx` 固定使用 `TwseProvider`。
- 長區間自動選源／切源提示 UI（[data7](../project-planning/task-pool/data7.md)）尚未實作。
