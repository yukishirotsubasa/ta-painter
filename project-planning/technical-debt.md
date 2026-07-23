# Technical Debt

## ChartContainer 指標 reconcile 邏輯對每個已掛載實例無條件呼叫 update()，未做變更診斷

- **來源任務**：[indicator5](task-pool/indicator5.md)
- **狀況**：`ChartContainer.tsx` 的指標 reconcile `useEffect`（依賴 `[data, indicators]`）在每次觸發時，對所有已掛載的指標實例都呼叫 `handle.update(data, instance.params)`，不論該實例的 `params` 是否真的變動、或變動的是不是別的實例。這是刻意選擇的簡化實作（避免對 `IndicatorInstance` 做深層比較），目前每個指標的 `compute()` 都是輕量純函式（MA 的簡單移動平均），重複呼叫成本可忽略。
- **影響**：目前規模下沒有可觀察的效能問題。但當已掛載指標數量變多、或未來加入 `compute()` 較重的指標（例如需要大量歷史資料的複雜運算）時，調整單一實例參數會連帶重算並重繪其他未變動的指標，可能造成不必要的效能開銷與圖表閃爍。
- **建議**：若未來觀察到效能問題，可在 `IndicatorInstance` 或 reconcile 邏輯中加入變更偵測（例如比對 `params` 的淺層 diff 或維護 `IndicatorInstance` 的版本號/參考相等性判斷），只對實際變動的實例呼叫 `update()`。
- **對應任務**：暫無（defer，現無效能問題，觀察到再處理）。

## ChartContainer 圖表配色寫死，未跟隨 light/dark 主題

- **來源任務**：[chart1](task-pool/chart1.md) / [chart2](task-pool/chart2.md)
- **狀況**：`web/src/index.css` 已用 `prefers-color-scheme` 定義 `--bg`/`--text`/`--border` 等 CSS variable 供 light/dark 兩套配色，但 `ChartContainer.tsx` 的 `createChart` 選項（`layout.textColor`、`grid` 線色）與量能柱漲跌色、各指標線色都是寫死的 hex 常數，不會隨系統主題切換。lightweight-charts 是 canvas 渲染，CSS variable 無法直接套用，需要 JS 端讀取目前主題再呼叫 `chart.applyOptions()`。
- **~~共用常數重複定義~~（已解，indicator8，2026-07-23）**：漲跌色已抽出至 [`lib/chart/colors.ts`](../web/src/lib/chart/colors.ts)（`UP_COLOR`/`DOWN_COLOR`/`DEFAULT_LINE_COLOR`），`ChartContainer.tsx`（量能柱）與 `macd.ts`（histogram）改共用同一份，不再各自重複定義；布林三軌、MACD DIF/DEA 線色亦改為可調參數（預設沿用 `DEFAULT_LINE_COLOR`/`#ff9800`）。**唯「配色不跟隨系統 light/dark 主題」這部分仍未解**（見下）。
- **影響**：目前介面沒有主題切換 UI，尚未有可觀察的視覺錯誤；但 responsive/RWD 模組（`responsive1`）或任何未來的主題切換功能上線後，圖表本身（含量能柱與 MACD histogram、各指標線的預設色）會維持深色配色不跟著換，造成視覺不一致。
- **建議**：實作淺色主題支援時，改用 `window.matchMedia('(prefers-color-scheme: dark)')`（或未來的主題 state）動態算出色票，並在偵測到主題變化時對圖表與各指標的 series 呼叫對應的 `applyOptions()`/重新 `setData()` 更新；共用色票已集中在 `lib/chart/colors.ts`，屆時可直接讓該檔依主題輸出兩套色值。
- **對應任務**：共用常數抽出已由 [indicator8](task-pool/indicator8.md) 完成；主題跟隨系統的部分留 responsive 模組。

## PaneIndexAllocator 尚未驗證多個 separate-pane 指標同時存在的 index 一致性

- **來源任務**：[indicator4](task-pool/indicator4.md)
- **狀況**：`createPaneIndexAllocator()`（`lib/chart/paneIndexAllocator.ts`）只是邏輯上的計數器，並未對應 lightweight-charts 實際的 pane 陣列行為——當一個 pane 內最後一個 series 被移除時，lightweight-charts 會自動移除該 pane 並讓後面的 pane index 往前遞補，但 allocator 內部記錄的「已配置 index 集合」不會知道這件事。目前唯一的 separate-pane 指標是 MACD，已驗證「新增 → 移除 → 再新增」單一 MACD 實例時 pane index 分配正確（見 `docs/indicators.md` 手動驗證紀錄），但**尚未驗證兩個以上 separate-pane 指標同時存在、且移除中間那個時**，allocator 記錄的 index 是否仍對應 lightweight-charts 實際的 pane 陣列位置。
- **影響**：目前規模下（只有 MACD 一種 separate-pane 指標）不會觸發這個情境，沒有可觀察的錯誤。但未來若新增第二種 separate-pane 指標（例如 RSI），使用者同時掛載兩個 separate-pane 指標後移除較前面那個，allocator 釋放的 index 可能與 lightweight-charts 實際遞補後的 pane 位置不一致，導致後續 `mount()`/`update()` 操作到錯誤的 pane。
- **建議**：新增第二種 separate-pane 指標時，需實測「兩個 separate-pane 指標同時掛載 → 移除前面那個 → 檢查後面那個的 pane 是否還在正確位置」這個情境；若證實有錯位問題，需改為由 `ChartContainer` 直接查詢 `chart.panes()` 目前實際數量/位置來決定 index，而不是讓 allocator 自己維護獨立計數器。
- **對應任務**：無獨立任務；於新增第 2 個 separate-pane 指標時一併實測處理。

## ~~`ChartToolbar` 輸入框不會跟隨外部 `stockNo` 變化重新同步~~（已解：symbol2 加上同步 `useEffect`，2026-07-23）

- **解法**：`ChartToolbar.tsx` 加了 `useEffect(() => { setDraft(stockNo); ... }, [stockNo])`。symbol2 讓 `App.tsx` 依股票清單正規化代號大小寫（`00631l` → `00631L`）並回寫，正是「外部改變 `stockNo`」的實例，已實測輸入框同步更新。share2 的 URL 還原不需再處理這件事。
- **來源任務**：[chart3](task-pool/chart3.md)
- **狀況**：`ChartToolbar.tsx` 用 `useState(stockNo)` 初始化本地 `draft` state，只在元件掛載當下取一次 `stockNo` prop 的值，之後 `stockNo` prop 變動不會反向同步回 `draft`（沒有對應的同步 `useEffect`）。目前唯一會改變 `stockNo` 的路徑就是這個元件自己的 `onSubmit`，所以 `draft` 與 `stockNo` 目前保證同步，沒有可觀察的問題。
- **影響**：[share2](task-pool/share2.md)（URL hash 還原）預計會在 `App.tsx` 用解碼出的股票代號呼叫 `setStockNo()`，屆時 `stockNo` 會被外部（非 `ChartToolbar` 自己）改變；`ChartToolbar` 的輸入框仍會顯示掛載當下的舊代號，即使圖表已經正確切換到還原後的新代號，造成輸入框顯示值與實際圖表資料不一致。
- **建議**：實作 share2 時，在 `ChartToolbar.tsx` 加一個 `useEffect(() => setDraft(stockNo), [stockNo])`，或改用「以 `stockNo` prop 直接控制 input 顯示、`draft` 只在使用者主動輸入時才 diverge」的完全受控寫法。
- **對應任務**：[share2](task-pool/share2.md) / [symbol2](task-pool/symbol2.md)（兩者皆會由外部改變 `stockNo`，屆時一併加同步）。

## ~~畫線選取的點擊命中容差太小，實測難以選中線條~~（已解：drawing6 移除畫布點擊選取，2026-07-23）

- **決策／解法**：drawing6 直接**移除整條畫布點擊選取路徑**（`DrawingController.hitTestLines()`、`TrendLinePrimitive.hitTest()`／`distanceToSegment`／`HIT_TEST_TOLERANCE_PX` 全數刪除），選取與刪除改由側邊欄清單（`getLines`/`onLinesChange`/`highlightLine`/`deleteLine` API，sidebar3 消費）。既然不再有畫布點擊命中判定，「容差太小、難以點中」的問題自然消失，不需要再調整容差。此則關閉。以下為原始紀錄。
- **來源任務**：[drawing4](task-pool/drawing4.md)
- **狀況**：`DrawingController`（`web/src/lib/chart/drawing/drawingController.ts`）的 `hitTestLines()` 目前是「由後往前找第一個命中就回傳」，命中判定委給 `TrendLinePrimitive.hitTest()`（`web/src/lib/chart/drawing/trendLinePrimitive.ts`），容差為 `HIT_TEST_TOLERANCE_PX = 6`（px）。使用者實測（真實瀏覽器，非本 repo 沙盒環境）回報：刪除單條線的功能可以正常運作，但線條太細，點擊很難準確選中。
- **影響**：選取刪除單條線的核心功能已可用（unit test 涵蓋選取/刪除/清除選取等情境），但實際操作體驗不佳，容易點擊落空或（多線交叉時）選錯線。
- **建議**：下次優化畫線模式時一併調整，已討論過的方向：
  1. 加大容差（例如 6→10~12px）並把 `hitTestLines()` 改成「取全部線中距離最小且 ≤ 容差」的那條，而非目前「由後往前第一個命中」；避免多線交叉時選錯。
  2. 在此之上疊加 hover 預覽：`onCrosshairMove` 目前只在 `dragging` 時處理，其實未按下滑鼠移動也會持續觸發 `subscribeCrosshairMove`，可以在未拖曳時也做 hit-test，滑到線附近就即時提示（游標變 `pointer`、線條 hover 高亮），讓使用者點擊前就知道會選到哪條。
  3. 另一個評估過但改動範圍明顯較大的方向：另外做一個「已畫線條清單」UI 面板，列出每條線並附刪除按鈕，完全不需要在畫布上精準點選；但需要把 `DrawingController` 內部的 `lines` 陣列曝光成可被 React 觀察（目前是純 imperative 黑盒、沒有任何回調），超出當初 drawing4 的 scope。
- **對應任務**：[drawing6](task-pool/drawing6.md) + [sidebar3](task-pool/sidebar3.md)。方向調整為**移除畫布點擊選取**、改由側邊欄「已畫線清單」選取與刪除，故不再需要調整命中容差。

## 觸控裝置無法刪除選取中的單條線（缺少刪除 UI）

- **來源任務**：[drawing5](task-pool/drawing5.md)（行動觸控人工驗證，2026-07-22）
- **狀況**：`DrawingController.deleteSelectedLine()`（`web/src/lib/chart/drawing/drawingController.ts`）只透過 `window` 的 `keydown` 監聽器觸發（`Delete`/`Backspace`，見 [`docs/drawing.md`](../docs/drawing.md)）。觸控裝置沒有實體鍵盤，選取到線條後（觸控端命中判定比桌面容易）沒有任何按鈕或手勢可以刪除該線；`DrawingController` 也沒有對外曝光選取狀態變化的回呼或 public 的 `deleteSelected()` 方法，React 層目前無從得知「目前有沒有線被選取」。
- **影響**：觸控使用者可以畫線、選取線，但無法單獨刪除某一條，只能靠切換股票代號（`clearAll()`）整批清除。使用者實測後確認此限制暫不處理。
- **現況（2026-07-23 更新，drawing6）**：drawing6 已解決此則的**根因**——`DrawingController` 現在對外曝光 `getLines()`/`onLinesChange()`/`deleteLine(id)`/`highlightLine(id)`，React 層可觀察線清單並刪除單條線（不再只綁鍵盤，桌面／觸控通用）；同時移除了舊的畫布點擊選取＋`window` `keydown`（`Delete`/`Backspace`）刪除路徑。**尚缺的只剩實際的清單 UI**：在 [sidebar3](task-pool/sidebar3.md) 的「畫線區塊」把這些 API 接成可檢視／高亮／刪除的面板之前，UI 上暫時只能整批清除。此則待 sidebar3 完成後關閉。
- **建議**：討論過的候選方案（優先度依實作成本排序）：
  1. `ChartToolbar` 固定加一顆「刪除選取線」按鈕，平常 disabled，有選取時才 enabled；需要 `DrawingController` 曝光 selection-changed callback + public `deleteSelected()`。
  2. 選取線條後，在該線附近浮現一顆刪除／X 按鈕；體驗更直覺（所見即所刪），但需要把邏輯座標換算成畫面像素座標來定位按鈕，改動範圍較大。
  3. 用手勢觸發（例如長按已選取的線）；不需新增 UI 元件，但容易誤觸，且需要跟現有「長按開始畫線」手勢做區分，衝突風險較高。
  方案 1 與現有 `HIT_TEST_TOLERANCE_PX` 命中容差優化（見下一則技術債）可以一併處理，因為兩者都需要先把 `DrawingController` 的內部選取狀態曝光給 React 層觀察。
- **對應任務**：[drawing6](task-pool/drawing6.md) + [sidebar3](task-pool/sidebar3.md)（側邊欄清單刪除，觸控/桌面通用）。

## 沒有本機 pre-commit/CI type-check，`main` 曾出現能過 test 但過不了 `tsc -b` 的 commit

- **來源任務**：[drawing4](task-pool/drawing4.md)（修正於本次 session，2026-07-22）
- **狀況**：drawing4 完成時（commit `9016432`）`TrendLinePrimitive.hitTest()` 回傳 `boolean`，但專案實裝的 `lightweight-charts@5.2.0` 型別要求 `ISeriesPrimitiveBase.hitTest` 回傳 `PrimitiveHoveredItem | null`。`npm test`（vitest）當時全數通過（測試只驗證行為，不跑型別檢查），但這個型別錯誤直到 push 後才被 GitHub Actions 的 `npm run build`（`tsc -b && vite build`，見 `.github/workflows/deploy-pages.yml`）攔下，導致部署失敗。本地沒有任何 pre-commit hook 或本機 CI 腳本會在 commit 前跑 `tsc -b`。已於本次 session 修正（`hitTest` 改回傳 `PrimitiveHoveredItem | null`，命中回傳 `{ cursorStyle: 'pointer', externalId: 'trend-line', zOrder: 'normal' }`，未命中回傳 `null`；`DrawingController.hitTestLines()` 改用 `!== null` 判斷），詳見 [`docs/drawing.md`](../docs/drawing.md)。
- **影響**：目前僅發生一次（型別錯誤，非邏輯錯誤，實際互動行為不受影響），但這個落差模式（本機只跑 `npm test` 就 commit，未跑 `npm run build`）未來仍可能重演，尤其是升級第三方套件版本（如 lightweight-charts）後型別介面變動時最容易中招，且要等 push 後才會在 CI 發現，拖慢回饋速度。
- **建議**：養成 commit/push 前跑一次 `npm run build`（或至少 `tsc -b`）的習慣；若要根治，可考慮加 Husky pre-commit hook 跑 `tsc -b`，或在 `deploy-pages.yml` 之外另建一個「PR/push 到非 main 分支」也會跑 `npm run build` 的 CI workflow，讓型別錯誤在合併前就被攔下而非等到部署才發現。
- **對應任務**：[ci1](task-pool/ci1.md)。

## `worker/` 的 Deno Deploy 部署沒有 CI 測試 gate

- **來源任務**：[infra2](task-pool/infra2.md)
- **狀況**：`worker/`（CORS proxy）透過 Deno Deploy 的 GitHub 連動自動部署，push 到 `main` 就會重新部署，中間沒有任何步驟跑 `deno task test`。跟 `web/` 不同——`web/` 至少有 `deploy-pages.yml` 在部署前跑 `npm run build`（`tsc -b` 會攔型別錯誤，見下面「沒有本機 pre-commit/CI type-check」那則），`worker/` 完全沒有對應的 CI 檢查步驟。
- **影響**：目前 `handler.ts` 邏輯簡單、`handler_test.ts` 只有 5 個純函式 unit test，人工跑過沒問題；但未來若改動 proxy 邏輯，即使測試沒過、或 `deno check` 型別有誤，push 到 `main` 一樣會觸發部署，錯誤要等到 curl 打正式站台才會發現。
- **建議**：加一個獨立的 GitHub Actions workflow（只監聽 `worker/**`，比照 `deploy-pages.yml` 只監聽 `web/**` 的做法），push 前跑 `deno task test`（必要時加 `deno check main.ts`），測試沒過就讓 CI 標紅，即使不會阻止 Deno Deploy 的自動部署，至少能在 push 後盡快被看到。
- **對應任務**：[ci2](task-pool/ci2.md)。

## TPEx／Yahoo 的反爬蟲規則不受控，proxy 可能再次失效且無監控

- **來源任務**：[infra2](task-pool/infra2.md)
- **狀況**：實作過程中實測發現兩個上游站台的存取限制都是「非官方文件、隨時可能變動」的規則：TPEx 會封鎖 Cloudflare Workers 的出站 IP range（因此把 proxy 從 Cloudflare Worker 改成 Deno Deploy，見 [`docs/proxy.md`](../docs/proxy.md)）、Yahoo Finance 對非瀏覽器 `User-Agent` 一律回 429（因此固定偽裝瀏覽器 UA）。這些都是對方站台當下的行為，沒有官方文件保證不會再變。
- **影響**：若 TPEx 未來也開始封鎖 Deno Deploy 的出站 IP range、或 Yahoo 加強 bot 偵測（例如需要 JS challenge、更嚴格的 header 檢查），`data5`（`TpexProvider`）／`data6`（`YahooProvider`）會在沒有任何預警的情況下開始失敗，而目前沒有任何自動化健康檢查或告警機制會發現這件事，只能靠使用者回報「查不到資料」。
- **現況（2026-07-22 更新）**：`data5`/`data6` 已完成。provider 對非預期狀態已有明確錯誤訊息——`TpexProvider` throw `TPEx 請求失敗：HTTP {status}` / `TPEx 查詢失敗：{stat}`；`YahooProvider` 所有 symbol 後綴皆失敗時 throw `Yahoo 查詢失敗（{stockNo}）：{description 或 HTTP status}`，方便日後快速判斷是不是上游又擋人。但**定期健康檢查／告警仍未實作**（此則技術債的核心未解）。
- **建議**：加一個簡單的排程（例如 GitHub Actions cron）定期 curl 這兩個 proxy 端點（TPEx 個股、Yahoo `.TW`/`.TWO`），失敗時發通知，及早發現上游規則變動，而非等使用者回報。
- **對應任務**：[ci3](task-pool/ci3.md)。

## MA volume 來源的 pane index 在 `ma.ts` 硬編，與 `ChartContainer` 的 pane 佈局約定重複

- **來源任務**：[indicator7](task-pool/indicator7.md)（2026-07-23）
- **狀況**：`ma.ts` 為了讓 `source=volume` 的 MA 掛到量能 pane，直接寫死 `PRICE_PANE_INDEX = 0` / `VOLUME_PANE_INDEX = 1` 兩個常數。這份「pane 0=K 線、pane 1=量能」的知識實際上由 `ChartContainer.tsx` 擁有（`RESERVED_PANE_COUNT = 2` 與建立 candlestick/volume series 的順序決定），`ma.ts` 只是複製了同一份約定，兩邊沒有共用來源。這是刻意的簡化：MA 是 overlay 不走 `paneIndexAllocator`，而 allocator 目前也沒有「查詢保留 pane 語意」的 API。
- **影響**：目前 pane 佈局固定，沒有可觀察問題。但若未來 `ChartContainer` 調整保留 pane 的數量或順序（例如把量能改成可關閉、或在 K 線與量能之間插入其他 reserved pane），`ma.ts` 的 `VOLUME_PANE_INDEX = 1` 會靜默指向錯誤的 pane（volume MA 掛錯位置或撐爆別的 scale），且 TypeScript 無法在編譯期攔到。
- **建議**：把「保留 pane 的語意 → index」對應集中到單一來源，例如在 `paneIndexAllocator`（或新的 `lib/chart/panes.ts`）曝光 `PRICE_PANE_INDEX`/`VOLUME_PANE_INDEX` 具名常數，讓 `ChartContainer` 與 `ma.ts` 共同引用；或由 `mount()` 透過參數把量能 pane index 傳進來，而非在指標檔案內硬編。
- **對應任務**：暫無（defer，pane 佈局變動時一併處理）。

## `ma.ts` 仍保留自己的 `DEFAULT_COLOR`，未併入共用 `colors.ts`

- **來源任務**：[indicator8](task-pool/indicator8.md)（2026-07-23）
- **狀況**：indicator8 抽出 `lib/chart/colors.ts` 的 `DEFAULT_LINE_COLOR = '#2196f3'` 供布林/MACD 線色參數預設值使用，但 `ma.ts` 仍沿用自己既有的 `const DEFAULT_COLOR = '#2196f3'`（indicator7 留下），未改成 import `DEFAULT_LINE_COLOR`。這是刻意不擴大 scope 的取捨——indicator8 驗收只要求 `ChartContainer.tsx` 與 `macd.ts` 不重複定義，`ma.ts` 屬剛完成的 indicator7 檔案，為避免動到已測過的行為而未一併整併。
- **影響**：兩個常數數值相同（`#2196f3`），目前無可觀察問題。但未來若要調整「預設線色」這個語意（例如整體改用另一個藍），需同時改 `colors.ts` 與 `ma.ts` 兩處，漏改一處會造成 MA 與布林/MACD 預設線色不一致。
- **建議**：下次動到 `ma.ts` 時，把 `DEFAULT_COLOR` 改成 `import { DEFAULT_LINE_COLOR } from '../colors'`，讓三個指標共用單一預設線色來源。
- **對應任務**：暫無（defer，動到 `ma.ts` 時順手整併）。

## 股票清單的有效性 gate 只擋「整份為空」，單一分類／單一來源縮水會靜默通過

- **來源任務**：[symbol1](task-pool/symbol1.md)（2026-07-23）
- **狀況**：`web/scripts/stock-list/fetchSources.ts` 的 gate 是「該來源解析後 rows 為空 → 整體失敗」，判定粒度是**整個來源**。但 TWSE 端實際是三個分類（`股票`／`創新板`／`ETF`）各自累加，且分類名採**精確字串比對**（見 [`docs/stock-list.md`](../docs/stock-list.md)）。若 TWSE 只是把其中一類改名（例如 `創新板` → `創新板股票`），該類會整段被跳過、其餘兩類照常解析，rows 不為空 → gate 放行 → 靜默發佈一份少了一整類標的的清單，不會有任何失敗通知。同理，MOPS CSV 若某次只回傳少數幾列，也一樣會通過。解碼層也幫不上忙：Node 的 Big5/GBK 解碼器把 0x80–0xFF 單位元組映到私用區而不丟錯，`fatal: true` 攔不到「編碼猜錯」，gate 是唯一防線。
- **影響**：目前三個分類名與實際頁面完全吻合（2026-07-23 實跑：上市 1314 檔 + 上櫃 891 檔 = 2205 檔），沒有可觀察問題。但這類失效的特徵是**沒有錯誤訊息**——使用者只會發現某些代號搜不到（symbol2 完成後更明顯），而不會有 workflow 標紅或通知信，排查成本遠高於直接失敗。
- **建議**：把 gate 從「非空」加嚴為「合理」，兩個成本很低的方向：
  1. 每個 TWSE 分類各自要求至少 N 筆（例如 `股票` ≥ 500、`ETF` ≥ 100、`創新板` ≥ 1），任一類掛零就整體失敗。
  2. 與 repo 內既有的 `web/public/stock-list.json` 比對總數，驟降超過某比例（例如 10%）就失敗；`main.ts` 本來就會讀舊檔做內容比對，拿得到舊清單，改動很小。
- **對應任務**：暫無（defer，symbol2 完成、清單實際被搜尋使用後再視情況加嚴）。

## 本機 Node 版本無法直接執行股票清單抓取腳本

- **來源任務**：[symbol1](task-pool/symbol1.md)（2026-07-23）
- **狀況**：`web/scripts/stock-list/` 以 TypeScript 撰寫，靠 Node 內建的型別剝除（22.6+）直接執行 `.ts`，CI 已固定 Node 24。但本機目前是 Node 20，`npm run update-stock-list` 跑不起來；使用者已明確決定**不升級本機 Node**。本次驗證是用 `tsc --rewriteRelativeImportExtensions` 先轉譯到暫存目錄再執行，屬一次性手法，沒有留在 repo 裡。
- **影響**：parser 的 32 個單元測試由 vitest 執行，不受本機 Node 版本影響，所以日常改動仍有測試保護；但「對真實線上來源實跑一次」這種端到端驗證，本機無法一鍵重現，只能靠 GitHub Actions 上的 `workflow_dispatch`，回饋比較慢。上游改版時的除錯體驗尤其受影響。
- **建議**：若日後需要本機重跑，成本由低到高有三條路：(1) 用 `npx tsx scripts/stock-list/main.ts`（多一個 devDependency，不動 Node）；(2) 加一個 `vite-node` 或 `vitest` 的一次性 script；(3) 升級本機 Node 到 22.6+。在使用者維持現況的前提下，維持「本機只跑測試、實跑交給 CI」即可，不需預先處理。
- **對應任務**：暫無（defer，使用者決定不升級本機 Node）。

## 沒有元件測試環境，React 互動邏輯只能靠瀏覽器手測

- **來源任務**：[symbol2](task-pool/symbol2.md)（2026-07-23）
- **狀況**：vitest 目前跑在 node 環境（未裝 jsdom／happy-dom 與 testing-library），所有測試都只涵蓋純函式。symbol2 把可測邏輯盡量抽成純函式（`searchStocks`／`findByCode`／`findByNamePrefix`／`resolveSubmitCode`，23 例），但 `ChartToolbar` 內的互動——↑/↓ 環繞選取、Enter 送出、`isComposing` 擋隱式送出、`onMouseDown` 早於 `blur`、`stockNo` 外部變動的同步 `useEffect`、提示訊息的清除時機——沒有任何自動化測試，本次是逐項在 dev server 上以 DOM 查詢驗證的。
- **影響**：這些互動細節（尤其 `isComposing` 與 `mousedown`/`blur` 的先後）正是最容易在重構時無聲壞掉的部分，回歸只能靠人工重測。另外沙盒環境的 Browser pane 無法截圖（`Screenshot timed out: the Browser pane is not displayed`），驗證只能靠 `javascript_tool` 讀 DOM，成本比一般手測更高。CDP 合成的 Enter 鍵也不會觸發表單的隱式送出，該路徑是改以 `form.requestSubmit()` 驗證、真實 Enter 由使用者複測確認。
- **建議**：加 `jsdom` + `@testing-library/react`（`vitest.config` 用 `environmentMatchGlobs` 只對元件測試切環境，避免拖慢既有純函式測試）。優先補的案例：↑/↓ 環繞、Enter 送出選取項、名稱查無時不呼叫 `onSubmit`、`stockNo` prop 變動同步輸入框。
- **對應任務**：暫無（defer，下次動到元件互動邏輯時一併補）。

## 股票清單型別在 `scripts/` 與 `src/` 各自宣告一份

- **來源任務**：[symbol2](task-pool/symbol2.md)（2026-07-23）
- **狀況**：`Market` 與 `StockListEntry` 同時存在於 `web/scripts/stock-list/stockList.ts`（產出端）與 `web/src/lib/stock/types.ts`（消費端），內容相同但各自宣告。兩邊分屬 `tsconfig.node.json` 與 `tsconfig.app.json` 兩個編譯單元（`src/` 不能 import `scripts/`，否則 app 建置會把 Node 專用程式碼牽進來），所以不是單純忘了共用。
- **影響**：`stock-list.json` 的欄位若增減（例如未來加產業別、市場再細分），要同步改兩處；漏改一處不會有型別錯誤——消費端只是拿不到新欄位，或反過來把已消失的欄位當成必填而在 `isStockListEntry()` 把整份清單過濾成空，症狀是「搜尋突然什麼都找不到」而非編譯失敗。
- **建議**：真要共用的話，把型別抽到兩個 tsconfig 都納入的第三處（例如 `web/shared/stockList.types.ts`，純型別檔、無執行期程式碼），兩邊各自 `import type`。欄位穩定的現況下成本效益不高，可等實際要改欄位時再做。
- **對應任務**：暫無（defer）。

## ~~三來源成交量口徑不一致（Yahoo 略低）~~（決策：不處理，2026-07-22）

- **來源任務**：[data6](task-pool/data6.md)
- **決策**：三來源量能口徑不同（Yahoo 不含盤後定價／鉅額交易，實測 2330 於 2024-09-02 TWSE 19,272,593 股 vs Yahoo 18,646,835 股，OHLC 一致）。經確認**依來源原樣顯示，不做正規化、不加 tooltip 註明**；[data7](task-pool/data7.md) 亦不做跨源標示。此則關閉、不再追蹤。
