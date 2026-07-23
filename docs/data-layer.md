# 資料層（`web/src/lib/data/`）

> 本文件記錄**已實作**的資料層行為（TWSE、TPEx、Yahoo 三個 provider 皆已實作，並經 `dataSource.ts` 接進 UI，見「資料源路由」一節）。規劃中的整體設計見 `project-planning/design.md`。

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

三個資料來源（TWSE、TPEx、Yahoo）都實作 `StockDataProvider`，由 `providers/providerRegistry.ts` 的 `registerProvider()`/`getProvider()`/`listProviders()` 管理。Provider 模組在載入時以 side-effect 方式自行呼叫 `registerProvider()`（見各 provider 檔案最後一行），呼叫端只要 `import` 該檔案即可完成註冊，不需另外手動註冊。

TPEx／Yahoo 直連會被 CORS 擋，需經 CORS proxy 轉發（見 [proxy.md](proxy.md)）。proxy base URL 與 URL 組裝集中在 `providers/proxy.ts` 的 `buildProxyUrl(source, upstreamPath)`：把上游相對路徑（含 query，須以 `/` 開頭）整段 `encodeURIComponent` 後塞進 `?path=` 參數。TWSE 端點本身帶 `access-control-allow-origin: *`，不走 proxy。

## `TwseProvider`（`providers/twseProvider.ts`）

- 直連 `https://www.twse.com.tw/exchangeReport/STOCK_DAY`，該端點回應帶 `access-control-allow-origin: *`，瀏覽器可直接 `fetch`，不需 CORS proxy。
- `date` 查詢參數只決定**查詢月份**，一次呼叫回傳整個月的資料，與 `range.end` 無關（`range.end` 只用來過濾回傳結果，見下）。
- 回應日期為民國年格式（如 `113/09/02`），`parseRocDate()` 轉為西元年 `YYYY-MM-DD`。
- 回傳的 `data` 依 `range.start`/`range.end` 過濾並依時間排序後才回傳（見 `fetchDaily` 內的 `.filter().sort()`）。
- `stat !== 'OK'` 或 HTTP 非 2xx 一律 `throw`。

## `TpexProvider`（`providers/tpexProvider.ts`）

上櫃股票，經 proxy 走 TPEx 新版站台端點（舊版 `.php` 端點已停用）。

- 端點：`/www/zh-tw/afterTrading/tradingStock?code={stockNo}&date={YYYY/MM/01}&id=&response=json`（經 `buildProxyUrl('tpex', ...)`）。
- `date` 用**西元年** `YYYY/MM/01`，只決定查詢月份，一次回傳整月（與 `range.end` 無關，僅用來過濾）。與逐月節流的搭配同 TWSE。
- 回應結構為 `body.tables[0].data`，每列欄位順序：`[日期(民國), 成交仟股, 成交仟元, 開, 高, 低, 收, 漲跌, 筆數]`。日期民國格式（`113/09/02`）同樣以 `parseRocDate()` 轉西元年。
- **成交量單位是「成交仟股」**，解析時 `×1000` 轉為股數，與 TWSE（原始股數）對齊。
- 頂層 `stat` 為**小寫** `'ok'`（TWSE 是大寫 `'OK'`），以 `toLowerCase()` 比對；非 `ok` 或 HTTP 非 2xx 一律 `throw`。
- **查無此代號時 TPEx 仍回 `stat=ok` + 空 `data`**，不視為錯誤，回傳空陣列（交由上層裁切／快取處理），與 TWSE「查無資料即 throw」的行為不同。

## `YahooProvider`（`providers/yahooProvider.ts`）

上市＋上櫃皆可，經 proxy 走 Yahoo Finance chart API，**單次請求即可取得整段區間**（不需逐月串接），長區間查詢明顯快於 TWSE 逐月方式。

- 端點：`/v8/finance/chart/{symbol}?period1={unix}&period2={unix}&interval=1d`（經 `buildProxyUrl('yahoo', ...)`）。`period1` = `range.start` 當日 00:00 UTC 秒數；`period2` = `range.end` + 1 天（排他上界，確保含 end 當日）。
- **Symbol 後綴自動 fallback**：provider 介面只拿得到 `stockNo`（無市場別），因此依序嘗試 `.TW`（上市）→ `.TWO`（上櫃），取第一個回傳有效 `chart.result` 的；錯的後綴 Yahoo 回 404 + `chart.error`。上市股單發一次、上櫃股會多一次 `.TW` 的 404 探測。全部後綴皆失敗才 `throw`（錯誤訊息帶 `chart.error.description` 或 `HTTP {status}`，方便定位上游是否又擋人）。
- 回應 `chart.result[0]` 的 `timestamp[]`（當日開盤 09:00 的 Unix 秒）與 `indicators.quote[0]` 的 `open/high/low/close/volume[]` 對齊；用 `meta.gmtoffset`（台股 28800）把 timestamp 轉為當地日期 `YYYY-MM-DD`。
- **null 缺值過濾**：停牌／缺值日的 OHLCV 欄位為 `null`，整列略過。
- volume 為原始股數，不需轉換（與 TWSE 一致）。
- 進度回報：查詢成功後呼叫一次 `onProgress({ loaded: 1, total: 1 })`。

## 逐月節流查詢（`throttle.ts` — `fetchDailyRange`）

`fetchDailyRange(provider, stockNo, range, onProgress?, signal?)` 是**官方源**查詢長區間資料的入口（由 `dataSource.ts` 的 `fetchBars()` 呼叫，見下節；Yahoo 為單次請求不走這裡）：

1. 依 `range` 展開成 `'YYYY-MM'` 月份清單（`listMonths`），起訖月皆含、無缺漏無重複。
2. 逐月循序處理，每個月：
   - 先呼叫 `cache.getCachedMonth(provider.id, stockNo, monthLabel)`；命中就直接用快取資料，**不打網路、不節流等待**。
   - 未命中則以**整月**範圍（`fullMonthRange`，非裁切過的查詢區間）呼叫 `provider.fetchDaily()`，並把整月結果寫入快取（`cache.setCachedMonth`）——之所以查整月而非裁切區間，是為了讓同一個月被不同查詢區間命中時，快取內容仍然完整可重用。
   - 無論來源是快取或網路，取得的整月資料最後都會依原始 `range` 裁切（`clipToRange`）後才併入回傳結果，確保回傳範圍精確符合呼叫端要求的區間。
   - 每次月與月之間若**真的發送了網路請求**，才等待 300–500ms 隨機節流（若該月是快取命中，不等待，因此重查已快取區間會明顯變快）。
   - 每完成一個月呼叫一次 `onProgress({ loaded, total, message })`。
3. 支援 `AbortSignal`：呼叫前或等待節流期間偵測到 `signal.aborted` 會立即中止並 reject `AbortError`，不會再發送後續請求。

## 資料源路由（`dataSource.ts`，data7）

`App.tsx` 不直接持有 provider，改透過 `dataSource.ts` 這層決定「這次查詢要走哪個 provider、用哪種抓取策略」：

```ts
type DataSource = 'yahoo' | 'official';

const DATA_SOURCES: DataSource[] = ['yahoo', 'official'];
const DEFAULT_DATA_SOURCE: DataSource = 'yahoo';
const DATA_SOURCE_LABEL: Record<DataSource, string>; // 'Yahoo（快）' / '官方（TWSE／TPEx）'

function resolveProvider(source: DataSource, market: Market | null): StockDataProvider | null;
function estimateRequestCount(source: DataSource, range: DateRange): number;
function fetchBars(
  source: DataSource,
  stockNo: string,
  market: Market | null,
  range: DateRange,
  onProgress?: FetchProgressCallback,
  signal?: AbortSignal,
): Promise<OhlcvBar[]>;
```

- `resolveProvider()`：`yahoo` 恆為 `YahooProvider`（上市／上櫃通用、與市場別無關）；`official` 依市場別路由 `TWSE → TwseProvider`、`TPEX → TpexProvider`；**官方源但市場別為 `null`（代號不在股票清單內）時回傳 `null`**。模組頂端 `import` 三個 provider 檔案完成 side-effect 註冊，再用 id 從 `providerRegistry` 取實例。
- `fetchBars()`：**Yahoo 走單次 `provider.fetchDaily()`**（一次取回整段區間，不經逐月迴圈，因此也不經 localStorage 月快取與月間節流）；**官方源走 `fetchDailyRange()`**（逐月 + 快取 + 300–500ms 節流）。無法解析 provider 時 reject `無法判斷 {stockNo} 的市場別（不在股票清單內），請改用 Yahoo 資料源`。
- `estimateRequestCount()`：Yahoo 恆為 1、官方源等於區間月數（快取命中不會減少估計值），供 `App.tsx` 設定進度條的 `total`。

## `App.tsx` 的查詢流程

- 預設資料源為 **Yahoo**（`DEFAULT_DATA_SOURCE`），可由側邊欄資料源區塊切換（見 [sidebar.md](sidebar.md)）。查詢區間固定為近 `QUERY_MONTHS = 6` 個月。
- **路由用的市場別只在官方源時採用**（`routingMarket = dataSource === 'official' ? symbol.market : null`）：Yahoo 模式下股票清單補上市場別不會觸發重新查詢。
- **官方源但市場別未知時不發查詢、也不清空既有資料**：`bars` 維持前一次結果，header 顯示 `notice`（`代號不在股票清單內，官方源無法判斷市場別；圖表仍顯示前一次查詢結果，請改用 Yahoo 或改查其他代號`），側邊欄另有路由層級的警告。這與查詢失敗的 `error`（會清空 `bars`）是不同狀態。
- **代號送出 debounce（300ms）**：Enter 確認、下拉建議選取、查詢按鈕三條路徑都會走同一個查詢 effect，`fetchBars()` 包在 `setTimeout(…, QUERY_DEBOUNCE_MS)` 內，cleanup 同時 `clearTimeout()` 與 `AbortController.abort()`，因此**快速連續切換代號時只有最後一次真的發出請求**。進度條在 timer 之外先設好，載入回饋不受延遲影響。
- **同代號重送為 no-op**：`lib/stock/selection.ts` 的 `applySubmittedCode(prev, code)` 在代號未變時回傳原物件參考，避免「重按查詢 → `market` 被重設為 `null` → 官方源守門 → 清單解析完再查一次」的多餘往返。

## 錯誤分類（`errors.ts`，data8）

三個 provider 都只 `throw new Error(...)`（訊息帶來源與原因），分類由純函式 `classifyDataError(err): DataErrorKind` 從錯誤訊息事後判別，provider 不需改動。

- `upstream-blocked`：上游被擋／掛掉。命中條件為 `err instanceof TypeError`（瀏覽器 fetch 失敗一律是 `TypeError`）、訊息含 `Failed to fetch`／`NetworkError`／`Network request failed`／`Load failed`，或訊息中的 `HTTP {status}` 為 **403 / 429 / >= 500**。
- `no-data`：請求成功但查無資料。命中條件為訊息中的 `HTTP 404`（Yahoo 對不存在的 symbol），或訊息含「查詢失敗」字樣（TWSE／TPEx 的 `stat` 非 OK、Yahoo 的 `chart.error.description`）。
- `unknown`：其餘（含 `無法判斷 {stockNo} 的市場別…`、`HTTP 400` 這類無法歸類的狀態碼、非 `Error` 值）。

**判別順序：`TypeError` → 網路錯誤訊息 → `HTTP {status}` → 「查詢失敗」字樣 → `unknown`。** 狀態碼必須排在「查詢失敗」之前，因為 Yahoo 的訊息（`Yahoo 查詢失敗（2454）：HTTP 403`）同時含兩者。

分類規則有單元測試（`errors.test.ts`）涵蓋三種 kind；瀏覽器實測（2026-07-24，沙盒 Chromium）：stub proxy 回 403 → 顯示 `Yahoo 查詢失敗（2454）：HTTP 403` **加上**提示；查無資料（`No data found, symbol may be delisted`）→ 只有原始訊息，`.app-error-hint` 不存在。

`App.tsx` 的 `error` state 為 `{ message, kind }`：`message` 永遠原樣顯示（方便使用者回報時附上），**只有 `kind === 'upstream-blocked'` 時**才在下方追加一行固定文案（`.app-error-hint`，`資料源可能已失效（上游擋掉或服務異常），並非你的輸入有誤；若持續發生請聯絡製作者。`）。刻意只給純文字，不附 GitHub Issues 連結或 email。

## localStorage 快取（`cache.ts`）

- Key 格式：`` ohlcv:{providerId}:{stockNo}:{YYYYMM} ``，儲存內容為該月**完整**的 `OhlcvBar[]`（未依查詢區間裁切）。
- 索引：`cache:index` 存一個 `{ key, lastAccess }[]` 陣列，每次讀取命中（`getCachedMonth`）或寫入（`setCachedMonth`）都會更新對應項目的 `lastAccess`。
- **當月資料一律視為過期**：`getCachedMonth`/`setCachedMonth` 內部用 `currentMonthLabel()`（依實際系統時間算出的 `'YYYY-MM'`）判斷，若查詢的月份等於當月，讀取一律回傳 `undefined`（強制重抓），寫入也直接跳過不快取——避免月中抓到的不完整資料被誤當成「已完結的歷史月份」永久快取下來。
- **LRU 淘汰**：`MAX_CACHE_ENTRIES`（目前 500）為容量門檻，`setCachedMonth` 寫入後若索引筆數超過門檻，依 `lastAccess` 由舊到新淘汰多出的筆數（`evictIfNeeded`），從 `localStorage` 移除對應 key 並更新索引。
- 對 `localStorage` 不存在（例如非瀏覽器環境）或操作拋錯（如 quota 超限）的情況做了防呆：讀取回傳 `undefined`、寫入靜默略過，不會讓呼叫端因為快取層失敗而整個查詢中斷。
- 目前沒有自動化測試涵蓋「瀏覽器 Network 面板無重複請求」與「LRU 真的淘汰最舊資料」這兩項屬於 [data4](../project-planning/task-pool/data4.md) 驗收方式的第 1、3 點——這兩點在單元測試（`cache.test.ts`、`throttle.test.ts`）中改以程式邏輯驗證（mock `localStorage`、確認 provider 不被重複呼叫、確認淘汰的是最舊項目），未在真實瀏覽器手動複測過。

## 已知限制 / 尚未實作

- **Yahoo 路徑不走 localStorage 月快取**：`fetchBars()` 對 Yahoo 直接單次請求，重查同一區間仍會實打上游一次。這是明確決策（Yahoo 單次查詢成本低），請求頻率由代號送出的 300ms debounce 控制，不另外加快取回填。
- **查詢區間固定 6 個月**：`App.tsx` 的 `QUERY_MONTHS` 寫死，沒有區間選擇 UI。
- Yahoo 的成交量不含盤後定價／鉅額交易，數值略低於 TWSE／TPEx 官方（OHLC 一致）；三來源的量能單位雖已統一為股數，但同一檔股票跨來源查詢時量能會有小幅落差，見 [technical-debt.md](../project-planning/technical-debt.md)。
- TPEx／Yahoo 的反爬蟲／IP 封鎖規則不受我方控制，proxy 可能再次失效；沒有週期性健康檢查（原 cron 方向已取消），只有 data8 的使用端即時提示，見 [technical-debt.md](../project-planning/technical-debt.md)。
- **錯誤分類靠訊息字串比對**：provider 沒有結構化的錯誤型別，`classifyDataError()` 依賴訊息中的 `HTTP {status}` 與「查詢失敗」字樣，改動 provider 錯誤訊息時必須同步檢查 `errors.test.ts`。
