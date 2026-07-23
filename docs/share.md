# URL 分享（`web/src/lib/state/`、`components/share/ShareLinkButton.tsx`、`App.tsx`）

> 本文件記錄**已實作**的 URL 狀態分享（share1 編解碼 + share2 hash 還原）。圖片分享（截圖／剪貼簿／Web Share，share3–5）尚未實作，不在此文件範圍。整體規劃見 `project-planning/design.md`。

分享的完整資料流：

```text
App state ──toShare*()──▶ ShareState ──encodeShareState()──▶ 精簡字串 ──lz-string──▶ #s=…
                                                                                      │
App state ◀──還原──── ShareState ◀──decodeShareState()──── 精簡字串 ◀──lz-string──────┘
```

## `ShareState`（`lib/state/schema.ts`）

以 zod 定義，型別由 schema 推導（`z.infer`），驗證與型別只有一份來源：

```ts
const shareStateSchema = z.object({
  symbol: z.string().min(1),                 // 股票代號，例 '2330'
  prov: z.enum(['yahoo', 'official']),       // 對應 DataSource
  range: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' },
  indicators: z.array(z.object({
    definitionId: z.string().min(1),         // 對應 IndicatorDefinition.id
    params: z.record(z.string(), z.union([z.number(), z.string()])),
  })),
  lines: z.array(z.object({
    points: z.tuple([點, 點]),               // 點 = { time: 'YYYY-MM-DD' | epoch 秒, price: number }
    color: /^#[0-9a-f]{6}$/,                 // 一律小寫 #rrggbb
    width: z.number().positive(),
  })),
});
```

**刻意不含版本欄位**。版本演進靠兩件事處理，因此不必為每條連結付版本號的長度成本：

1. 編碼格式向前相容——新欄位一律**附加在既有結構尾端**，舊連結解不到就用預設值。
2. 解碼逐項容錯——單一指標或單一線段壞掉只丟該項，不會讓整條連結失效。

不進 `ShareState` 的東西：`IndicatorInstance.id`（uuid 只在本機 session 有意義，還原時重新產生）、`DrawnLine.id`、畫線工具列目前選色（那是「下一條線要用的顏色」，不是畫面狀態）、側邊欄收合狀態。

## 編碼格式（`lib/state/urlState.ts`）

先把結構壓成最短的字串，再交給 `lz-string.compressToEncodedURIComponent`。先做精簡再壓縮，比直接壓 JSON 短得多。

```text
symbol | prov | start~end | indicator,indicator,… | line,line,…
```

- 分隔符：欄位 `|`、項目 `,`、項目內欄位 `~`、指標代碼與參數之間 `:`。
- `prov`：`y`（yahoo）／`o`（official）。
- 日期：`YYYYMMDD`（去掉 `-`）。
- **指標**：`code` 或 `code:arg~arg~…`
  - `code` 取 `IndicatorDefinition.urlCode`（`ma`／`bb`／`md`，見 [indicators.md](indicators.md)）。
  - args **依 `paramsSchema` 的順序**排列，等於該參數 `default` 的留空，尾端連續空值直接截掉。
  - number → `String(value)`；enum → 足以區分所有選項的**最短前綴**（MA 的 `source` 因此壓成 `c`/`o`/`h`/`l`/`v`）；color → 去 `#`，可縮寫時壓成 3 碼。
  - 例：MA 週期 60、來源 close（預設）、線色紅 → `ma:60~~f00`；MA 全預設 → `ma`；布林全預設 → `bb`。
- **線段**：`t1~p1~t2~p2~color~width`，時間 8 碼視為 `YYYYMMDD`、其餘視為 epoch 秒數（epoch 落在 8 碼代表 1970 年，日線情境不可能出現）；`width` 缺漏時回退 `DEFAULT_TREND_LINE_WIDTH`（供未來格式演進，目前編碼一定會寫）。

分隔符用 `~` 而不是 `.`：週期、標準差倍數、價格都可能是浮點數，用 `.` 會與小數點衝突（`bb:20.2.5` 無從判斷是 `20`+`2.5` 還是 `20.2`+`5`）。

### API

```ts
encodeShareState(state: ShareState): string        // 輸入先經 schema.parse（不合法即丟例外，屬呼叫端 bug）
decodeShareState(encoded: string): ShareState | null
```

- **解碼容錯分兩層**：
  - *整體失敗* → 回傳 `null`：解壓失敗、欄位不足、`prov` 代碼不認得、區間日期不合法、`symbol` 為空。
  - *單項失敗* → 捨棄該項、其餘照常：未知的指標短代碼、參數值型別不符（`bb:abc`）、線段欄位數不足或座標壞掉。任何情況都不會拋出未捕捉例外。
- **參數正規化**：`decode` 回傳的 `params` 一定是**補滿該指標所有 `paramsSchema` key** 的結果（省略的位置用 registry 預設值補回）；反之 `encode` 會丟棄不在 `paramsSchema` 內的多餘 key。因此 round-trip 對「參數剛好是該指標完整參數集」的狀態是深度相等的。
- 未註冊的 `definitionId` 在 `encode` 時無短代碼可用，會被略過（其餘指標照常編碼）。

## Hash 讀寫與 App 還原（`lib/state/shareUrl.ts` + `App.tsx`）

hash 格式為 `#s=<編碼>`（用 hash 而非 query string：GitHub Pages 靜態託管對 query 有潛在 rewrite 問題）。

```ts
readShareHash(hash): { status: 'absent' } | { status: 'invalid' } | { status: 'ok'; state: ShareState }
formatShareHash(state): string   // '#s=…'

toShareIndicators(instances) / toIndicatorInstances(shareIndicators, createId?)
toShareLines(drawnLines) / toTrendLinePoints(shareLine)
toShareTime(time) / toChartTime(shareTime)
```

**解析不能用 `URLSearchParams`**：`compressToEncodedURIComponent` 的字母表含 `+`，而 `URLSearchParams` 會把 query 語意的 `+` 當成空白，payload 會靜默壞掉。因此改成直接切 `s=` 字首取原始值（有對應的單元測試專門守這件事）。

還原順序（`App.tsx`）：

1. **掛載當下讀一次** `window.location.hash`（之後 hash 由 App 自己維護，不回讀、不監聽 `hashchange`）。
2. `symbol` / `prov` / `range` / `indicators` 直接作為對應 `useState` 的初始值。`range` 原本每次查詢用 `lastMonthsRange(6)` 重算，為了能被連結還原改成收進 state。
3. **線條延後還原**：解出的 `lines` 先放進 `pendingLinesRef`，等**第一批 K 線資料到位**（`bars.length > 0`）才逐條 `chartRef.current.addLine()`。不能更早——`ChartContainer` 會在 `stockNo` 變動（含首次掛載）時 `clearAll()`，太早加的線會被清掉。
4. `status: 'invalid'` 時照常載入預設畫面，並在 header 顯示「分享連結無法解析（可能被截斷或改動過），已改用預設畫面」；使用者送出新代號或切換資料源後這則提示消失。

hash 同步（同一個 `useEffect`，依賴 `[stockNo, dataSource, range, indicators, lines]`）：

- 用 `history.replaceState` 而非 `pushState`，操作過程不會灌爆瀏覽器上一頁記錄。
- **還原完成前不寫**（`pendingLinesRef` 非空時直接 return），否則會用「還沒補上線條」的狀態覆蓋掉連結裡的線。
- 整段包 `try/catch`：編碼失敗只代表這次沒更新網址，不影響畫面。
- `toShareLines()` 會略過尚未定案（`points === null`）或時間格式無法編碼（`BusinessDay` 物件形式，本專案的日線資料不會產生）的線，其餘照常分享。

## 分享按鈕（`components/share/ShareLinkButton.tsx`）

畫面狀態本來就持續同步在網址列上，所以「分享」只是把目前網址複製到剪貼簿，不需要另外組連結：`navigator.clipboard.writeText(window.location.href)`，成功顯示「已複製分享連結」，失敗（非安全連線、瀏覽器不支援、或文件未取得焦點）顯示「複製失敗，請手動複製網址列」，提示 2 秒後自動消失。

## 手動驗證紀錄

以下在真實瀏覽器（`npm run dev`）驗證過，本次 session 網路可通、能實際抓到 K 線資料：

- 帶 `#s=`（2 指標 + 2 線）開新頁：指標清單列出 MA 與布林通道，MA 參數還原為 `period=60` / `source=close` / `color=#ff0000` 與連結一致；側邊欄顯示「畫線（2）」。
- 還原後 App 回寫的 hash 與原字串等價（原手工字串裡的 `00ff00` 被編碼器壓成縮寫 `0f0`，解出結果相同）。
- 調整指標參數：hash 即時更新，`history.length` 不變（確認走 `replaceState`）。
- `#s=totally-broken-payload!!!`：正常載入、圖表在、顯示「分享連結無法解析…」提示，console 無錯誤。
- 使用者實測：畫線後複製網址、開新分頁貼上，線條完整還原（位置與顏色）。
- 分享按鈕的**失敗**分支已在沙盒確認（文件未取得焦點時 clipboard reject → 顯示手動複製提示）；成功分支由使用者在真實瀏覽器點擊確認。

## 已知限制 / 尚未實作

- **`range` 沒有 UI**：目前一律是「最近 6 個月」，只是為了讓連結能固定住當初的區間才進 `ShareState`。因此舊分享連結打開時用的是**當初分享的區間**，不會跟著今天往後滾動。
- **首次查詢失敗時的線條還原**：線條要等 `bars` 到位才補上，若還原當下的查詢失敗，`pendingLinesRef` 會一直留著（見 `project-planning/technical-debt.md`）。
- 圖片分享（截圖、剪貼簿貼圖、Web Share）屬 share3–5，尚未實作。
