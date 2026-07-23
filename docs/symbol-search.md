# 代號搜尋（`web/src/lib/stock/`、`components/chart/ChartToolbar.tsx`）

> 本文件記錄**已實作**的前端代號搜尋（symbol2）：載入 `stock-list.json`、代號／名稱搜尋建議、送出前的代號解析。清單如何產生見 [`stock-list.md`](./stock-list.md)。

## 型別（`lib/stock/types.ts`）

```ts
type Market = 'TWSE' | 'TPEX';

interface StockListEntry {
  code: string;
  name: string;
  market: Market;
}

/** market 為 null＝代號不在清單內（或清單尚未載入完成）。 */
interface SymbolSelection {
  code: string;
  market: Market | null;
}

const MARKET_LABEL: Record<Market, string> = { TWSE: '上市', TPEX: '上櫃' };
```

`Market`／`StockListEntry` 與產清單腳本的 `web/scripts/stock-list/stockList.ts` 定義相同但各自宣告——`scripts/` 走 `tsconfig.node.json`、`src/` 走 `tsconfig.app.json`，是兩套獨立編譯單元。

## 清單載入（`lib/stock/stockList.ts`）

```ts
loadStockList(): Promise<StockListEntry[]>
resetStockListCache(): void   // 測試用
```

- URL 為 `` `${import.meta.env.BASE_URL}stock-list.json` ``，隨 Pages 的 `base`（`/ta-painter/`）走；檔案是 symbol1 每週 commit 進 repo 的靜態資產，非執行期抓取，**不經 proxy**。
- 模組層快取 `Promise`，全站只抓一次（約 100 KB / 2205 筆）。
- **失敗不快取**：catch 到錯誤時把快取清成 `null` 再往外丟，下次呼叫會重新抓。
- 逐筆以 `isStockListEntry()` 驗證形狀後 `filter`，壞掉的項目丟棄、其餘照用；整份不是陣列或 HTTP 非 2xx 才 reject。

## 搜尋與解析（`lib/stock/search.ts`）

```ts
searchStocks(entries, query, limit = 8): StockListEntry[]
findByCode(entries, code): StockListEntry | undefined
findByNamePrefix(entries, query): StockListEntry | undefined
resolveSubmitCode(entries, raw): string | null
```

### `searchStocks()` — 下拉建議

比對優先序（同分保持清單原始順序，即代號遞增）：

| 序 | 條件 | 例（查詢 `233`／`台積`）|
|---|---|---|
| 0 | 代號開頭符合 | `2330`、`2337` |
| 1 | 名稱開頭符合 | `台積電` |
| 2 | 代號包含 | `1233`、`2233`、`6233` |
| 3 | 名稱包含 | — |

查詢字串 `trim()` + `toLowerCase()`（代號含字母的 ETF `00631L` 才能用小寫輸入命中）；空字串回傳空陣列（不顯示下拉）。

**不做跳字模糊比對**：2205 檔的清單下，跳字會讓「台積」帶出大量不相干結果，反而更難選中目標。

### `resolveSubmitCode()` — 送出前解析

回傳 `null` 代表「不是可查的目標」，呼叫端必須擋下、不得刷新資料。依序：

1. `findByCode()` 命中 → 回傳**清單裡的寫法**（`00631l` → `00631L`，正規化大小寫）
2. 純英數（`/^[0-9a-z]+$/i`）→ 原樣放行。清單每週才更新，剛掛牌的新代號可能還沒進清單，不該被擋
3. `findByNamePrefix()` 命中 → 回傳該筆代號（「台積」→ `2330`）
4. 皆不符 → `null`

第 4 條擋的是「把中文字串直接當 symbol 送進資料源」：`積電`（非名稱開頭）、`2330 台積電`（代號與名稱之間有空白）這類輸入，若放行會空等三秒才換來 TWSE 的「很抱歉，沒有符合條件的資料!」。

## `ChartToolbar`（`components/chart/ChartToolbar.tsx`）

輸入框為 ARIA combobox（`role="combobox"` + `aria-autocomplete="list"` + `aria-controls`／`aria-activedescendant`），下拉為 `role="listbox"`／`role="option"`，每列顯示代號、名稱、上市櫃。最多 8 筆，`z-index: 20` 蓋在圖表畫布之上。

| 操作 | 行為 |
|---|---|
| 輸入 / 聚焦 | 開啟下拉並即時重算建議 |
| ↑ / ↓ | 移動選取，兩端環繞，且會經過「未選取」狀態（`activeIndex === -1`）|
| Enter | 有選取項→帶入該筆；否則走 `resolveSubmitCode()` |
| Esc | 關閉下拉 |
| 滑鼠點選 | `onMouseDown` + `preventDefault()` 直接帶入 |
| 失焦 | 關閉下拉 |

- **`isComposing` 防呆**：中文輸入法選字中的 Enter 是「確認選字」，於 `keydown` 攔截並 `preventDefault()`，不觸發表單的隱式送出。
- **`onMouseDown` 而非 `onClick`**：`mousedown` 早於 `blur`，若等到 `click` 才處理，下拉已因失焦關閉，點擊會落空。
- **解析失敗的提示**：`resolveSubmitCode()` 回 `null` 時不呼叫 `onSubmit`，改在工具列顯示 `查無「積電」，請改用代號或從建議清單選取`（`role="alert"`）；輸入框一有變動、成功送出、或 `stockNo` 由外部改變時清除提示。
- **輸入框跟隨外部 `stockNo`**：`useEffect(() => { setDraft(stockNo); … }, [stockNo])`。這是 chart3 遺留技術債，symbol2 一併修掉；下述代號正規化即為「外部改變 `stockNo`」的實例，share2 的 URL 還原也不必再自行處理。

## 市場別的去向（`App.tsx`）

`App` 以 `SymbolSelection` 保存目前股票，並在 `market` 為 `null` 時查清單補齊：

```ts
const [symbol, setSymbol] = useState<SymbolSelection>({ code: DEFAULT_STOCK_NO, market: null });
// market === null 時 loadStockList() → findByCode() → setSymbol({ code: entry.code, market: entry.market })
```

`ChartToolbar` 的 `onSubmit` 只回傳代號，市場別一律由 `App` 這條路徑解析。好處是下拉選取、手動輸入代號、預設的 `2330`、未來 share2 的 URL 還原全走同一段程式，只有一處要維護；代價是解析為非同步（清單載入完成前 `market` 暫時是 `null`）。此路徑也負責把代號正規化成清單寫法後回寫 state，因此輸入框會跟著更新。

`symbol.market` 目前**只被記錄、尚未被讀取**：資料源仍固定 `TwseProvider`，依市場別自動路由 TWSE／TPEx 屬 [sidebar2](../project-planning/task-pool/sidebar2.md) 範疇。因此現在從建議清單選到上櫃股（如 `6488 環球晶`）會查詢失敗，屬已知限制。

## 測試

`lib/stock/search.test.ts`（排序、大小寫、名稱開頭、送出解析的放行與阻擋）、`lib/stock/stockList.test.ts`（只抓一次、壞資料過濾、HTTP／格式錯誤、失敗後可重試）。元件互動無 jsdom 環境，改以瀏覽器實測驗收（見 [symbol2](../project-planning/task-pool/symbol2.md)）。
