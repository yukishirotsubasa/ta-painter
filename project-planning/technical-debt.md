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

## `ChartToolbar` 輸入框不會跟隨外部 `stockNo` 變化重新同步

- **來源任務**：[chart3](task-pool/chart3.md)
- **狀況**：`ChartToolbar.tsx` 用 `useState(stockNo)` 初始化本地 `draft` state，只在元件掛載當下取一次 `stockNo` prop 的值，之後 `stockNo` prop 變動不會反向同步回 `draft`（沒有對應的同步 `useEffect`）。目前唯一會改變 `stockNo` 的路徑就是這個元件自己的 `onSubmit`，所以 `draft` 與 `stockNo` 目前保證同步，沒有可觀察的問題。
- **影響**：[share2](task-pool/share2.md)（URL hash 還原）預計會在 `App.tsx` 用解碼出的股票代號呼叫 `setStockNo()`，屆時 `stockNo` 會被外部（非 `ChartToolbar` 自己）改變；`ChartToolbar` 的輸入框仍會顯示掛載當下的舊代號，即使圖表已經正確切換到還原後的新代號，造成輸入框顯示值與實際圖表資料不一致。
- **建議**：實作 share2 時，在 `ChartToolbar.tsx` 加一個 `useEffect(() => setDraft(stockNo), [stockNo])`，或改用「以 `stockNo` prop 直接控制 input 顯示、`draft` 只在使用者主動輸入時才 diverge」的完全受控寫法。
- **對應任務**：[share2](task-pool/share2.md) / [symbol2](task-pool/symbol2.md)（兩者皆會由外部改變 `stockNo`，屆時一併加同步）。

## 畫線選取的點擊命中容差太小，實測難以選中線條

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

## ~~三來源成交量口徑不一致（Yahoo 略低）~~（決策：不處理，2026-07-22）

- **來源任務**：[data6](task-pool/data6.md)
- **決策**：三來源量能口徑不同（Yahoo 不含盤後定價／鉅額交易，實測 2330 於 2024-09-02 TWSE 19,272,593 股 vs Yahoo 18,646,835 股，OHLC 一致）。經確認**依來源原樣顯示，不做正規化、不加 tooltip 註明**；[data7](task-pool/data7.md) 亦不做跨源標示。此則關閉、不再追蹤。
