# 分享（`web/src/lib/state/`、`lib/chart/screenshot.ts`、`lib/share/imageShare.ts`、`components/share/`、`App.tsx`）

> 本文件記錄**已實作**的兩類分享：URL 狀態分享（share1 編解碼 + share2 hash 還原）與圖片分享（share3 截圖 + share4 剪貼簿 + share5 Web Share／下載）。整體規劃見 `project-planning/design.md`。

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

## 分享列（`components/share/ShareMenu.tsx` + `ShareLinkButton.tsx`）

header 上三顆按鈕，`ShareMenu` 是容器（含「複製圖片」「分享圖片」與圖片操作的提示文字），`ShareLinkButton` 是獨立元件（含自己的提示文字）：

| 按鈕 | 行為 | 提示 |
|---|---|---|
| 分享URL | `navigator.clipboard.writeText(window.location.href)` | 已複製分享連結／複製失敗，請手動複製網址列 |
| 複製圖片 | 截圖 → 剪貼簿，失敗退回下載 | 已複製圖片到剪貼簿／無法直接分享，已改為下載／截圖失敗，請稍後再試 |
| 分享圖片 | 截圖 → 系統分享面板，不支援或被拒退回下載 | 已分享圖片／無法直接分享，已改為下載／截圖失敗，請稍後再試 |

提示皆 2 秒後自動消失。畫面狀態本來就持續同步在網址列上，所以「分享URL」只是複製目前網址，不需要另外組連結；按鈕文字帶「URL」是為了與另外兩顆圖片按鈕區隔（原名「分享」看不出分享的是什麼）。

**行動版只有兩顆**（responsive2）：`ShareMenu` 與 `ShareLinkButton` 都收 `compact` prop（`App.tsx` 依斷點傳入），`compact` 時**不渲染「複製圖片」**，另兩顆縮短為「連結」（`aria-label="分享URL"`）與「分享圖」。理由是手機要把圖貼到別的 App，走系統分享面板（`navigator.share`）比剪貼簿直接，且頁首橫向空間有限。行為邏輯完全不變，見 [`responsive.md`](responsive.md)。

# 圖片分享

## 截圖（`lib/chart/screenshot.ts`）

```ts
takeChartScreenshotCanvas(chart, options?): HTMLCanvasElement
canvasToPngBlob(canvas): Promise<Blob>          // toBlob 包成 promise，回 null 時 reject
canvasToPngBlobSync(canvas): Blob               // toDataURL + 自解 base64
takeChartScreenshotBlob(chart, options?): Promise<Blob>
takeChartScreenshotBlobSync(chart, options?): Blob
resolvePageBackgroundColor(): string
fillCanvasBackground(canvas, color): void

interface ChartScreenshotOptions {
  addTopLayer?: boolean;        // 預設 true
  includeCrosshair?: boolean;   // 預設 false
  backgroundColor?: string | null;  // 省略取頁面 --bg，null 保留透明
}
```

`ChartContainer` 對外曝光成 `ChartHandle.takeScreenshot()`（Promise）與 `ChartHandle.takeScreenshotSync()`（同步），圖表尚未建立時皆回 `null`。

**手繪線一定會被截入，不需要 offscreen 疊繪備案**（`design.md` 待驗證項目 2 的結論）。lightweight-charts 每個 pane 有主畫布與 top 畫布兩張 canvas，primitive 的 pane view 依 `zOrder()` 分流：`'normal'`（未實作 `zOrder()` 時的預設，`TrendLinePrimitive` 即是）畫在**主畫布**，只有 `'top'` 與十字準星在 top 畫布。`takeScreenshot()` 一定合成主畫布，`addTopLayer` 只決定要不要再疊 top 畫布。預設仍開著，讓日後新增 `zOrder: 'top'` 的 primitive 也一併截入。

`includeCrosshair: false` 由函式庫實作：截圖期間暫時把 `crosshair.mode` 切成 `Hidden`、截完在 `finally` 還原，因此截圖不會有準星殘影，呼叫後選項也維持原值。

**一定要補底色**：`ChartContainer` 的 `layout.background` 是 `transparent`（讓圖表吃頁面底色），截圖主畫布同樣透明。PNG 保留 alpha，貼到不處理透明度的軟體會變黑底，所以 `takeChartScreenshotCanvas()` 預設用 `destination-over` 在內容底下補頁面 `--bg`（`getComputedStyle(document.documentElement)`，取不到時 fallback `#16171d`）。需要透明底時傳 `backgroundColor: null`。

**為什麼有同步版**：見下面「兩條路徑的 user activation」。

## 輸出管道（`lib/share/imageShare.ts`）

只負責「blob 送去哪」，與 `screenshot.ts`（圖表 → blob）分層。一律能力偵測，不看 UA。

```ts
supportsClipboardImage(): boolean               // ClipboardItem + navigator.clipboard.write 都要在
copyPngToClipboard(blob | Promise<Blob>): Promise<void>
toPngFile(blob, fileName): File
supportsFileShare(file): boolean                // navigator.share + canShare({files:[file]}) 都要過
sharePngFile(file, title): Promise<void>
isShareAborted(error): boolean                  // 只認 DOMException AbortError
downloadBlob(blob, fileName): void
screenshotFileName(stockNo, date?): string      // ta-painter-2330-20260723.png
```

- `supportsFileShare()` 必須拿**真的 `File`** 去問 `canShare({ files })`：`navigator.share` 存在不代表吃得下檔案（桌面 Chrome 常常只支援分享網址）。
- `downloadBlob()` 用 `<a download>` + object URL，`revokeObjectURL` 延到下一個 task（立刻 revoke 部分瀏覽器來不及取用）。

## 兩條路徑的 user activation（`ShareMenu.tsx`）

複製與分享都必須在 click handler 的同一鏈路內完成，但兩個 API 的限制不同，因此用了不同的截圖版本：

| | 複製圖片（share4） | 分享圖片（share5） |
|---|---|---|
| 目標 API | `navigator.clipboard.write()` | `navigator.share()` |
| 吃得下 promise？ | **可以**——`ClipboardItem` 的值允許 `Promise<Blob>` | 不行 |
| 截圖版本 | `takeScreenshot()`（非同步，不擋主執行緒） | `takeScreenshotSync()`（全程同步） |
| 作法 | click handler 內同步建好 `ClipboardItem` 並呼叫 `write()`，截圖在背景完成 | click handler 內同步拿到 blob → `File` → `canShare` → `share()`，中間沒有 await |

`share()` 這條若先 `await` 截圖再呼叫，會失去 transient user activation（iOS Safari 尤其嚴格）。`canvas.toDataURL()` 是同步 API，解 base64 自行組 Blob 就能全程同步；代價是編碼會擋住主執行緒（1440×1080 實測約 82 ms，使用者主動觸發，可接受）。

失敗處理：

- 兩條路徑「API 不存在」與「呼叫被拒」都退回下載，並沿用**同一份**截圖結果，不會重截。
- **例外：使用者在系統分享面板按取消**（`share()` reject `AbortError`）不算失敗，靜靜回到 idle，不補下載檔（否則變成「按了取消卻多一個檔案」）。
- 下載後瀏覽器／OS 會顯示自己的下載氣泡或分享面板（檔名、複製圖示等），那是原生 UI，頁面無法干預。

## 手動驗證紀錄

以下在真實瀏覽器（`npm run dev`）驗證過，本次 session 網路可通、能實際抓到 K 線資料：

- 帶 `#s=`（2 指標 + 2 線）開新頁：指標清單列出 MA 與布林通道，MA 參數還原為 `period=60` / `source=close` / `color=#ff0000` 與連結一致；側邊欄顯示「畫線（2）」。
- 還原後 App 回寫的 hash 與原字串等價（原手工字串裡的 `00ff00` 被編碼器壓成縮寫 `0f0`，解出結果相同）。
- 調整指標參數：hash 即時更新，`history.length` 不變（確認走 `replaceState`）。
- `#s=totally-broken-payload!!!`：正常載入、圖表在、顯示「分享連結無法解析…」提示，console 無錯誤。
- 使用者實測：畫線後複製網址、開新分頁貼上，線條完整還原（位置與顏色）。
- 分享URL 按鈕的**失敗**分支已在沙盒確認（文件未取得焦點時 clipboard reject → 顯示手動複製提示）；成功分支由使用者在真實瀏覽器點擊確認。

圖片分享（share3–5，2026-07-23，沙盒 Chromium + `javascript_tool` 白箱取像素，全程 console 無錯誤）：

- **截圖含手繪線**：建 800×600 真 chart + 60 根 K 棒，用 `DrawingController.addLine()` 畫兩條線（`#ff00ff`／`#00ffff`）。`addTopLayer: false` 的截圖就已含兩條線（magenta 3770 px、cyan 4028 px），`addTopLayer: true` 與 `false` 逐像素完全相同。
- **無準星殘影**：移動十字準星後 `includeCrosshair: false` 的截圖與「準星出現前」逐像素相同；同位置 `includeCrosshair: true` 多出 9219 個不透明像素（確認確實有東西可截）。截圖後 `crosshair.mode` 仍為原值。
- **補底色**：未補時 1,483,823 / 1,555,200 像素 alpha=0；補後透明像素 0、角落 `rgb(22,23,29)` = `#16171d`。
- **PNG 產物**：`takeChartScreenshotBlob()` 與 `takeChartScreenshotBlobSync()` 產物一致（皆 120641 bytes、1440×1080、magenta 3516／cyan 3512、透明像素 0、PNG magic 正確）。
- **複製圖片**：真的 `navigator.clipboard.write()` resolve，`ClipboardItem` 的 `types` 為 `['image/png']`、104822 bytes；解回 bitmap 為 2023×1188、漲色 55139 px／跌色 40149 px。模擬 `ClipboardItem` 不存在、以及 `write()` reject，兩者都退回下載且 `URL.createObjectURL` 只呼叫 1 次（沒有重截）。
- **分享圖片**五條分支（此沙盒瀏覽器原生**沒有** `navigator.share`／`canShare`，第一列是真實情境，其餘 stub）：原生無 Web Share → 下載；`canShare` 回 false → **不呼叫** `share()`、下載；分享成功 → 提示「已分享圖片」、無下載；`AbortError` → 無下載無錯誤提示；`NotAllowedError` → 下載。`share()` 收到的參數為 `{ title: 'TA Painter 2330', files: [File('ta-painter-2330-20260723.png', image/png)] }`。
- 使用者實測確認：複製圖片後貼到其他軟體顯示正確。

## 已知限制 / 尚未實作

- **`range` 沒有 UI**：目前一律是「最近 6 個月」，只是為了讓連結能固定住當初的區間才進 `ShareState`。因此舊分享連結打開時用的是**當初分享的區間**，不會跟著今天往後滾動。
- **首次查詢失敗時的線條還原**：線條要等 `bars` 到位才補上，若還原當下的查詢失敗，`pendingLinesRef` 會一直留著（見 `project-planning/technical-debt.md`）。
- **Web Share 真機路徑未驗證**：沙盒瀏覽器原生沒有 `navigator.share`／`canShare`，`share()` 成功／取消／被拒三條分支都是用 stub 模擬的。iOS Safari／Android Chrome 上實際叫出系統分享面板、分享到 LINE 尚待真機補測（見 `project-planning/technical-debt.md`）。
- **同步截圖會擋主執行緒**：`takeChartScreenshotBlobSync()` 在 1440×1080 實測約 82 ms。目前只有「分享圖片」走這條，且是使用者主動觸發，可接受。
- **截圖底色取頁面 `--bg`，但圖表本身配色寫死深色**：目前沒有主題切換 UI 所以看不出來；日後支援淺色主題時，截圖會變成白底配深色格線（見 `project-planning/technical-debt.md` 的「ChartContainer 圖表配色寫死」）。
- 下載／分享後的原生 UI（下載氣泡、系統分享面板）不在頁面控制範圍，按鈕文字與選項無法自訂。
