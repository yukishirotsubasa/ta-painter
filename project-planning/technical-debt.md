# Technical Debt

> **決策標記說明（2026-07-23 全面盤點後導入）**：每則債項都帶一行 `**決策**`，共四種——
>
> - **實作**：已排入 `task-list.md`，`對應任務` 指向該任務檔。
> - **延後**：已有任務檔但本輪不排入。
> - **Skip**：維持追蹤、不排任務，條件成熟再回頭處理（條目保留在清單上）。
> - **不處理**：關閉不再追蹤，標題加刪除線。
>
> 盤點結果：未解 21 則 → 實作 7、延後 1、Skip 6、不處理 6。清單上不應再出現沒有決策標記的未解條目。

## ChartContainer 指標 reconcile 邏輯對每個已掛載實例無條件呼叫 update()，未做變更診斷

- **來源任務**：[indicator5](task-pool/indicator5.md)
- **狀況**：`ChartContainer.tsx` 的指標 reconcile `useEffect`（依賴 `[data, indicators]`）在每次觸發時，對所有已掛載的指標實例都呼叫 `handle.update(data, instance.params)`，不論該實例的 `params` 是否真的變動、或變動的是不是別的實例。這是刻意選擇的簡化實作（避免對 `IndicatorInstance` 做深層比較），目前每個指標的 `compute()` 都是輕量純函式（MA 的簡單移動平均），重複呼叫成本可忽略。
- **影響**：目前規模下沒有可觀察的效能問題。但當已掛載指標數量變多、或未來加入 `compute()` 較重的指標（例如需要大量歷史資料的複雜運算）時，調整單一實例參數會連帶重算並重繪其他未變動的指標，可能造成不必要的效能開銷與圖表閃爍。
- **建議**：若未來觀察到效能問題，可在 `IndicatorInstance` 或 reconcile 邏輯中加入變更偵測（例如比對 `params` 的淺層 diff 或維護 `IndicatorInstance` 的版本號/參考相等性判斷），只對實際變動的實例呼叫 `update()`。
- **決策（2026-07-23）**：**實作**。雖然目前無可觀察的效能問題，但變更偵測的成本很低（`params` 是扁平 `Record<string, number | string>`，淺層比較即足夠），先做掉可避免未來加入重運算指標時才回頭改動這段共用邏輯。
- **對應任務**：[indicator11](task-pool/indicator11.md)。

## ~~ChartContainer 圖表配色寫死，未跟隨 light/dark 主題~~（已解：chart4 改為整站固定 dark，2026-07-24）

- **來源任務**：[chart1](task-pool/chart1.md) / [chart2](task-pool/chart2.md)
- **狀況**：`web/src/index.css` 已用 `prefers-color-scheme` 定義 `--bg`/`--text`/`--border` 等 CSS variable 供 light/dark 兩套配色，但 `ChartContainer.tsx` 的 `createChart` 選項（`layout.textColor`、`grid` 線色）與量能柱漲跌色、各指標線色都是寫死的 hex 常數，不會隨系統主題切換。lightweight-charts 是 canvas 渲染，CSS variable 無法直接套用，需要 JS 端讀取目前主題再呼叫 `chart.applyOptions()`。
- **~~共用常數重複定義~~（已解，indicator8，2026-07-23）**：漲跌色已抽出至 [`lib/chart/colors.ts`](../web/src/lib/chart/colors.ts)（`UP_COLOR`/`DOWN_COLOR`/`DEFAULT_LINE_COLOR`），`ChartContainer.tsx`（量能柱）與 `macd.ts`（histogram）改共用同一份，不再各自重複定義；布林三軌、MACD DIF/DEA 線色亦改為可調參數（預設沿用 `DEFAULT_LINE_COLOR`/`#ff9800`）。**唯「配色不跟隨系統 light/dark 主題」這部分仍未解**（見下）。
- **影響**：目前介面沒有主題切換 UI，尚未有可觀察的視覺錯誤；但 responsive/RWD 模組（`responsive1`）或任何未來的主題切換功能上線後，圖表本身（含量能柱與 MACD histogram、各指標線的預設色）會維持深色配色不跟著換，造成視覺不一致。
- **現況（2026-07-23 更新，share3）**：截圖（`lib/chart/screenshot.ts`）**已經**跟隨主題——`resolvePageBackgroundColor()` 讀 `getComputedStyle(document.documentElement)` 的 `--bg` 來補底色，會隨 `prefers-color-scheme` 變動。這反而讓落差更明顯：淺色主題下截圖會是**白底 + 深色格線 + 深色文字**（圖表內部配色仍寫死），比畫面上看起來更突兀。
- **決策（2026-07-23）**：**實作，但方向改為「整站固定 dark」而非「跟隨系統主題」**。理由是分享情境——同一張圖或同一條連結會在不同人的裝置上開啟，若配色隨各自的系統主題變動，會造成「同一份內容看起來不一樣」甚至難以瀏覽。固定深色後，圖表原本寫死的深色配色反而變成正確值，只需把色值搬進 `colors.ts` 去重即可。
- **原方向（已放棄）**：用 `window.matchMedia('(prefers-color-scheme: dark)')` 動態算色票、主題變化時對圖表與各指標 series 呼叫 `applyOptions()`／重新 `setData()`，並讓 `lib/chart/colors.ts` 依主題輸出兩套色值。**不做**，連帶也不做主題切換 UI。
- **實際做法（已完成，chart4，2026-07-24）**：`index.css` 把 `@media (prefers-color-scheme: dark)` 的變數值寫進 `:root` 並刪掉該 media query（順帶清掉專案未使用的 `#social .button-icon`）、`color-scheme` 改 `dark`；`colors.ts` 新增 `CHART_TEXT_COLOR = '#9ca3af'`/`CHART_GRID_COLOR = '#2e303a'` 供 `ChartContainer.tsx` 引用，該檔已無寫死顏色 hex；`index.html` 加 `<meta name="theme-color" content="#16171d">`。`screenshot.ts` 的 `resolvePageBackgroundColor()` 不動——`--bg` 固定後其結果自然恆定。
- **殘留**：CSS 變數與 `colors.ts` 常數是兩份人工同步的色值（canvas 讀不到 CSS variable），見下方「圖表色票與 CSS 變數需人工同步」。
- **對應任務**：共用常數抽出已由 [indicator8](task-pool/indicator8.md) 完成；固定 dark 主題由 [chart4](task-pool/chart4.md) 完成。

## PaneIndexAllocator 尚未驗證多個 separate-pane 指標同時存在的 index 一致性

- **來源任務**：[indicator4](task-pool/indicator4.md)
- **狀況**：`createPaneIndexAllocator()`（`lib/chart/paneIndexAllocator.ts`）只是邏輯上的計數器，並未對應 lightweight-charts 實際的 pane 陣列行為——當一個 pane 內最後一個 series 被移除時，lightweight-charts 會自動移除該 pane 並讓後面的 pane index 往前遞補，但 allocator 內部記錄的「已配置 index 集合」不會知道這件事。目前唯一的 separate-pane 指標是 MACD，已驗證「新增 → 移除 → 再新增」單一 MACD 實例時 pane index 分配正確（見 `docs/indicators.md` 手動驗證紀錄），但**尚未驗證兩個以上 separate-pane 指標同時存在、且移除中間那個時**，allocator 記錄的 index 是否仍對應 lightweight-charts 實際的 pane 陣列位置。
- **影響**：目前規模下（只有 MACD 一種 separate-pane 指標）不會觸發這個情境，沒有可觀察的錯誤。但未來若新增第二種 separate-pane 指標（例如 RSI），使用者同時掛載兩個 separate-pane 指標後移除較前面那個，allocator 釋放的 index 可能與 lightweight-charts 實際遞補後的 pane 位置不一致，導致後續 `mount()`/`update()` 操作到錯誤的 pane。
- **建議**：新增第二種 separate-pane 指標時，需實測「兩個 separate-pane 指標同時掛載 → 移除前面那個 → 檢查後面那個的 pane 是否還在正確位置」這個情境；若證實有錯位問題，需改為由 `ChartContainer` 直接查詢 `chart.panes()` 目前實際數量/位置來決定 index，而不是讓 allocator 自己維護獨立計數器。
- **決策（2026-07-23）**：**實作**，且不等到新增第二種 separate-pane 指標——直接改成由 `chart.panes()` 查詢實際 pane 陣列決定 index，allocator 不再自行維護計數器，從根本上消除「獨立計數器與函式庫實際行為可能不一致」這件事。介面與三個指標的 `mount()` 簽章維持不變。
- **驗證限制**：沙盒環境無法驗證真實 canvas／pane 行為，改以 fake `chart` 物件（`panes()` 回傳長度可變的陣列）做單元測試，另由使用者在真實瀏覽器手測 MACD 的新增／移除。
- **對應任務**：[indicator10](task-pool/indicator10.md)。

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

## ~~觸控裝置無法刪除選取中的單條線（缺少刪除 UI）~~（已解：sidebar3 側邊欄畫線清單，2026-07-23）

- **解法**：drawing6 曝光 `getLines()`/`onLinesChange()`/`deleteLine(id)`/`highlightLine(id)`，sidebar3 以 `components/sidebar/DrawingListPanel.tsx` 接成側邊欄「畫線區塊」：列出每條線、點項高亮、每項附刪除鈕（觸控目標 8px padding），桌面／觸控通用且不需鍵盤。使用者已在真實瀏覽器實測確認可刪除單條線，此則關閉。以下為原始紀錄。
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

## ~~沒有本機 pre-commit/CI type-check，`main` 曾出現能過 test 但過不了 `tsc -b` 的 commit~~（已解：ci1 加 `.githooks/pre-push`，2026-07-24）

- **解法（ci1，2026-07-24）**：新增版本控管的 `.githooks/pre-push`（+ `.githooks/README.md`），以 `git config core.hooksPath .githooks` 啟用，零 npm 依賴（不裝 husky、repo root 不新增 package.json）。hook 由 pre-push 的 stdin 算出本次 push 的差異範圍，只有動到 `web/` 才跑新增的 `npm run typecheck`（`tsc -b`），失敗即中止 push；`--no-verify` 可略過。實測三情境皆符合預期（只動 `project-planning/` → 短路放行；動 `web/` 且型別正常 → 通過；注入 `const x: number = "boom"` → 印 TS2322 並 exit 1）。細節見 [`docs/deployment.md`](../docs/deployment.md)。
- **方案調整**：原建議的兩條路（husky pre-commit／非-`main` 分支 CI）都未採用——實際開發流程只在 `main` 上作業、不開分支，分支/PR 的 CI 觸發不到；而 `main` push 的 CI 就是既有的 `deploy-pages.yml`（本來就跑 `npm run build`），再加一個 workflow 只是重複、且一樣要等 push 後才知道。pre-push 是唯一能在部署觸發前擋下的位置。
- **殘留限制**：hook 檢查 working tree 而非 commit 快照；且需每個 clone 手動 `git config core.hooksPath` 一次（零依賴方案的必然代價）。
- **來源任務**：[drawing4](task-pool/drawing4.md)（修正於本次 session，2026-07-22）
- **狀況**：drawing4 完成時（commit `9016432`）`TrendLinePrimitive.hitTest()` 回傳 `boolean`，但專案實裝的 `lightweight-charts@5.2.0` 型別要求 `ISeriesPrimitiveBase.hitTest` 回傳 `PrimitiveHoveredItem | null`。`npm test`（vitest）當時全數通過（測試只驗證行為，不跑型別檢查），但這個型別錯誤直到 push 後才被 GitHub Actions 的 `npm run build`（`tsc -b && vite build`，見 `.github/workflows/deploy-pages.yml`）攔下，導致部署失敗。本地沒有任何 pre-commit hook 或本機 CI 腳本會在 commit 前跑 `tsc -b`。已於本次 session 修正（`hitTest` 改回傳 `PrimitiveHoveredItem | null`，命中回傳 `{ cursorStyle: 'pointer', externalId: 'trend-line', zOrder: 'normal' }`，未命中回傳 `null`；`DrawingController.hitTestLines()` 改用 `!== null` 判斷），詳見 [`docs/drawing.md`](../docs/drawing.md)。
- **影響**：目前僅發生一次（型別錯誤，非邏輯錯誤，實際互動行為不受影響），但這個落差模式（本機只跑 `npm test` 就 commit，未跑 `npm run build`）未來仍可能重演，尤其是升級第三方套件版本（如 lightweight-charts）後型別介面變動時最容易中招，且要等 push 後才會在 CI 發現，拖慢回饋速度。
- **建議**：養成 commit/push 前跑一次 `npm run build`（或至少 `tsc -b`）的習慣；若要根治，可考慮加 Husky pre-commit hook 跑 `tsc -b`，或在 `deploy-pages.yml` 之外另建一個「PR/push 到非 main 分支」也會跑 `npm run build` 的 CI workflow，讓型別錯誤在合併前就被攔下而非等到部署才發現。
- **決策（2026-07-23）**：**實作，最優先**。已實際造成一次部署失敗，成本只有一個 workflow yml 或 husky hook，且後續其他任務都會改到型別敏感的程式碼，先立好 gate 收益最大。任務優先級由 Low 調為 High。
- **對應任務**：[ci1](task-pool/ci1.md)（已完成，2026-07-24）。

## `worker/` 的 Deno Deploy 部署沒有 CI 測試 gate

- **來源任務**：[infra2](task-pool/infra2.md)
- **狀況**：`worker/`（CORS proxy）透過 Deno Deploy 的 GitHub 連動自動部署，push 到 `main` 就會重新部署，中間沒有任何步驟跑 `deno task test`。跟 `web/` 不同——`web/` 至少有 `deploy-pages.yml` 在部署前跑 `npm run build`（`tsc -b` 會攔型別錯誤，見下面「沒有本機 pre-commit/CI type-check」那則），`worker/` 完全沒有對應的 CI 檢查步驟。
- **影響**：目前 `handler.ts` 邏輯簡單、`handler_test.ts` 只有 5 個純函式 unit test，人工跑過沒問題；但未來若改動 proxy 邏輯，即使測試沒過、或 `deno check` 型別有誤，push 到 `main` 一樣會觸發部署，錯誤要等到 curl 打正式站台才會發現。
- **建議**：加一個獨立的 GitHub Actions workflow（只監聽 `worker/**`，比照 `deploy-pages.yml` 只監聽 `web/**` 的做法），push 前跑 `deno task test`（必要時加 `deno check main.ts`），測試沒過就讓 CI 標紅，即使不會阻止 Deno Deploy 的自動部署，至少能在 push 後盡快被看到。
- **決策（2026-07-23）**：**延後**。任務檔已存在且方案明確，但 `worker/` 極少變動、`handler.ts` 邏輯簡單，本輪不排入；`ci2` 維持「等待」，排在執行順序最後。
- **對應任務**：[ci2](task-pool/ci2.md)。

## TPEx／Yahoo 的反爬蟲規則不受控，proxy 可能再次失效且無監控

- **來源任務**：[infra2](task-pool/infra2.md)
- **狀況**：實作過程中實測發現兩個上游站台的存取限制都是「非官方文件、隨時可能變動」的規則：TPEx 會封鎖 Cloudflare Workers 的出站 IP range（因此把 proxy 從 Cloudflare Worker 改成 Deno Deploy，見 [`docs/proxy.md`](../docs/proxy.md)）、Yahoo Finance 對非瀏覽器 `User-Agent` 一律回 429（因此固定偽裝瀏覽器 UA）。這些都是對方站台當下的行為，沒有官方文件保證不會再變。
- **影響**：若 TPEx 未來也開始封鎖 Deno Deploy 的出站 IP range、或 Yahoo 加強 bot 偵測（例如需要 JS challenge、更嚴格的 header 檢查），`data5`（`TpexProvider`）／`data6`（`YahooProvider`）會在沒有任何預警的情況下開始失敗，而目前沒有任何自動化健康檢查或告警機制會發現這件事，只能靠使用者回報「查不到資料」。
- **現況（2026-07-22 更新）**：`data5`/`data6` 已完成。provider 對非預期狀態已有明確錯誤訊息——`TpexProvider` throw `TPEx 請求失敗：HTTP {status}` / `TPEx 查詢失敗：{stat}`；`YahooProvider` 所有 symbol 後綴皆失敗時 throw `Yahoo 查詢失敗（{stockNo}）：{description 或 HTTP status}`，方便日後快速判斷是不是上游又擋人。但**定期健康檢查／告警仍未實作**（此則技術債的核心未解）。
- **決策（2026-07-23）**：**實作，但方向改為「使用端即時提示」而非「週期性健康檢查」**。上游出問題會**立即**影響使用者，而 cron 最快也要等下一個排程週期才發現，對使用者當下遇到的失敗毫無幫助；即使告警成功，使用者端仍只看得到一句原始錯誤訊息，不知道發生什麼事、也不知道該不該回報。
- **原方向（已取消）**：GitHub Actions cron 定期 curl 兩個 proxy 端點、失敗時發通知。原任務 [ci3](task-pool/ci3.md) 標記取消並保留取消理由供追溯，已從 `task-list.md` 移除。
- **實際做法**：資料層對錯誤分類（`upstream-blocked` / `no-data` / `unknown`），`App.tsx` **只在 `upstream-blocked` 時**於原始錯誤訊息下方追加固定文案，說明資料源可能已失效、請聯絡製作者。**只顯示文字，不附 GitHub Issues 連結或 email**；原始錯誤訊息保留顯示，方便回報時附上。
- **對應任務**：[data8](task-pool/data8.md)（取代 ci3）。

## MA volume 來源的 pane index 在 `ma.ts` 硬編，與 `ChartContainer` 的 pane 佈局約定重複

- **來源任務**：[indicator7](task-pool/indicator7.md)（2026-07-23）
- **狀況**：`ma.ts` 為了讓 `source=volume` 的 MA 掛到量能 pane，直接寫死 `PRICE_PANE_INDEX = 0` / `VOLUME_PANE_INDEX = 1` 兩個常數。這份「pane 0=K 線、pane 1=量能」的知識實際上由 `ChartContainer.tsx` 擁有（`RESERVED_PANE_COUNT = 2` 與建立 candlestick/volume series 的順序決定），`ma.ts` 只是複製了同一份約定，兩邊沒有共用來源。這是刻意的簡化：MA 是 overlay 不走 `paneIndexAllocator`，而 allocator 目前也沒有「查詢保留 pane 語意」的 API。
- **影響**：目前 pane 佈局固定，沒有可觀察問題。但若未來 `ChartContainer` 調整保留 pane 的數量或順序（例如把量能改成可關閉、或在 K 線與量能之間插入其他 reserved pane），`ma.ts` 的 `VOLUME_PANE_INDEX = 1` 會靜默指向錯誤的 pane（volume MA 掛錯位置或撐爆別的 scale），且 TypeScript 無法在編譯期攔到。
- **建議**：把「保留 pane 的語意 → index」對應集中到單一來源，例如在 `paneIndexAllocator`（或新的 `lib/chart/panes.ts`）曝光 `PRICE_PANE_INDEX`/`VOLUME_PANE_INDEX` 具名常數，讓 `ChartContainer` 與 `ma.ts` 共同引用；或由 `mount()` 透過參數把量能 pane index 傳進來，而非在指標檔案內硬編。
- **決策（2026-07-23）**：**實作**。抽 `lib/chart/panes.ts` 曝光具名常數供 `ChartContainer.tsx` 與 `ma.ts` 共同引用，成本很低且屬純重構，不必等 pane 佈局真的變動——那時才發現反而是靜默的錯誤 pane 指向。
- **對應任務**：[indicator9](task-pool/indicator9.md)。

## `ma.ts` 仍保留自己的 `DEFAULT_COLOR`，未併入共用 `colors.ts`

- **來源任務**：[indicator8](task-pool/indicator8.md)（2026-07-23）
- **狀況**：indicator8 抽出 `lib/chart/colors.ts` 的 `DEFAULT_LINE_COLOR = '#2196f3'` 供布林/MACD 線色參數預設值使用，但 `ma.ts` 仍沿用自己既有的 `const DEFAULT_COLOR = '#2196f3'`（indicator7 留下），未改成 import `DEFAULT_LINE_COLOR`。這是刻意不擴大 scope 的取捨——indicator8 驗收只要求 `ChartContainer.tsx` 與 `macd.ts` 不重複定義，`ma.ts` 屬剛完成的 indicator7 檔案，為避免動到已測過的行為而未一併整併。
- **影響**：兩個常數數值相同（`#2196f3`），目前無可觀察問題。但未來若要調整「預設線色」這個語意（例如整體改用另一個藍），需同時改 `colors.ts` 與 `ma.ts` 兩處，漏改一處會造成 MA 與布林/MACD 預設線色不一致。
- **建議**：下次動到 `ma.ts` 時，把 `DEFAULT_COLOR` 改成 `import { DEFAULT_LINE_COLOR } from '../colors'`，讓三個指標共用單一預設線色來源。
- **決策（2026-07-23）**：**實作**。一行 `import` 的改動，與同樣動到 `ma.ts` 的 pane index 整併合併為同一個任務一次做完。
- **對應任務**：[indicator9](task-pool/indicator9.md)。

## 圖表色票與 CSS 變數需人工同步（`CHART_TEXT_COLOR`／`CHART_GRID_COLOR` vs `--text`／`--border`）

- **來源任務**：[chart4](task-pool/chart4.md)（2026-07-24）
- **狀況**：chart4 把圖表座標文字色／格線色從 `ChartContainer.tsx` 的寫死 hex 搬到 `colors.ts` 的 `CHART_TEXT_COLOR = '#9ca3af'`／`CHART_GRID_COLOR = '#2e303a'`，但這兩個值與 `index.css` `:root` 的 `--text`／`--border` 是**兩份各自維護的相同色值**。根因是 lightweight-charts 以 canvas 渲染，讀不到 CSS variable；兩邊已互相加註解提醒要一起改。
- **影響**：目前值一致，無可觀察問題。日後調整整站文字／邊框色若只改 CSS，圖表座標文字與格線會留在舊色，造成頁面與 canvas 配色脫節（分享圖片同樣受影響）。
- **建議**：若之後真的常動色票，可在 `ChartContainer` mount 時用 `getComputedStyle(document.documentElement).getPropertyValue('--text')` 取值傳給 `createChart`，讓 CSS 成為單一來源；固定 dark 主題下沒有動態更新需求，讀一次即可。目前兩個值都是常態不變的，先不做。
- **決策（2026-07-24）**：**Skip**。等到實際需要改色票或引入主題切換時再回頭處理。

## 股票清單的有效性 gate 只擋「整份為空」，單一分類／單一來源縮水會靜默通過

- **來源任務**：[symbol1](task-pool/symbol1.md)（2026-07-23）
- **狀況**：`web/scripts/stock-list/fetchSources.ts` 的 gate 是「該來源解析後 rows 為空 → 整體失敗」，判定粒度是**整個來源**。但 TWSE 端實際是三個分類（`股票`／`創新板`／`ETF`）各自累加，且分類名採**精確字串比對**（見 [`docs/stock-list.md`](../docs/stock-list.md)）。若 TWSE 只是把其中一類改名（例如 `創新板` → `創新板股票`），該類會整段被跳過、其餘兩類照常解析，rows 不為空 → gate 放行 → 靜默發佈一份少了一整類標的的清單，不會有任何失敗通知。同理，MOPS CSV 若某次只回傳少數幾列，也一樣會通過。解碼層也幫不上忙：Node 的 Big5/GBK 解碼器把 0x80–0xFF 單位元組映到私用區而不丟錯，`fatal: true` 攔不到「編碼猜錯」，gate 是唯一防線。
- **影響**：目前三個分類名與實際頁面完全吻合（2026-07-23 實跑：上市 1314 檔 + 上櫃 891 檔 = 2205 檔），沒有可觀察問題。但這類失效的特徵是**沒有錯誤訊息**——使用者只會發現某些代號搜不到（symbol2 完成後更明顯），而不會有 workflow 標紅或通知信，排查成本遠高於直接失敗。
- **建議**：把 gate 從「非空」加嚴為「合理」，兩個成本很低的方向：
  1. 每個 TWSE 分類各自要求至少 N 筆（例如 `股票` ≥ 500、`ETF` ≥ 100、`創新板` ≥ 1），任一類掛零就整體失敗。
  2. 與 repo 內既有的 `web/public/stock-list.json` 比對總數，驟降超過某比例（例如 10%）就失敗；`main.ts` 本來就會讀舊檔做內容比對，拿得到舊清單，改動很小。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。目前三個分類名與實際頁面完全吻合，且清單每週更新、內容比對機制仍在；先維持現行「整份為空才失敗」的 gate。若日後真的發生某類靜默消失，上面兩個加嚴方向（分類下限／與舊檔比對總數驟降）成本都很低，屆時再做。
- **對應任務**：暫無（Skip）。

## ~~本機 Node 版本無法直接執行股票清單抓取腳本~~（決策：不處理，2026-07-23）

- **決策：不處理（2026-07-23）**。使用者已明確決定不升級本機 Node，且「本機只跑測試、對真實線上來源實跑交給 CI（`workflow_dispatch`）」是可接受的工作模式——parser 的 32 個單元測試由 vitest 執行、不受 Node 版本影響，日常改動仍有測試保護。此則關閉、不再追蹤。以下為原始紀錄。
- **來源任務**：[symbol1](task-pool/symbol1.md)（2026-07-23）
- **狀況**：`web/scripts/stock-list/` 以 TypeScript 撰寫，靠 Node 內建的型別剝除（22.6+）直接執行 `.ts`，CI 已固定 Node 24。但本機目前是 Node 20，`npm run update-stock-list` 跑不起來；使用者已明確決定**不升級本機 Node**。本次驗證是用 `tsc --rewriteRelativeImportExtensions` 先轉譯到暫存目錄再執行，屬一次性手法，沒有留在 repo 裡。
- **影響**：parser 的 32 個單元測試由 vitest 執行，不受本機 Node 版本影響，所以日常改動仍有測試保護；但「對真實線上來源實跑一次」這種端到端驗證，本機無法一鍵重現，只能靠 GitHub Actions 上的 `workflow_dispatch`，回饋比較慢。上游改版時的除錯體驗尤其受影響。
- **建議**：若日後需要本機重跑，成本由低到高有三條路：(1) 用 `npx tsx scripts/stock-list/main.ts`（多一個 devDependency，不動 Node）；(2) 加一個 `vite-node` 或 `vitest` 的一次性 script；(3) 升級本機 Node 到 22.6+。在使用者維持現況的前提下，維持「本機只跑測試、實跑交給 CI」即可，不需預先處理。
- **對應任務**：無（已關閉）。

## 沒有元件測試環境，React 互動邏輯只能靠瀏覽器手測

- **來源任務**：[symbol2](task-pool/symbol2.md)（2026-07-23）
- **狀況**：vitest 目前跑在 node 環境（未裝 jsdom／happy-dom 與 testing-library），所有測試都只涵蓋純函式。symbol2 把可測邏輯盡量抽成純函式（`searchStocks`／`findByCode`／`findByNamePrefix`／`resolveSubmitCode`，23 例），但 `ChartToolbar` 內的互動——↑/↓ 環繞選取、Enter 送出、`isComposing` 擋隱式送出、`onMouseDown` 早於 `blur`、`stockNo` 外部變動的同步 `useEffect`、提示訊息的清除時機——沒有任何自動化測試，本次是逐項在 dev server 上以 DOM 查詢驗證的。
- **影響**：這些互動細節（尤其 `isComposing` 與 `mousedown`/`blur` 的先後）正是最容易在重構時無聲壞掉的部分，回歸只能靠人工重測。另外沙盒環境的 Browser pane 無法截圖（`Screenshot timed out: the Browser pane is not displayed`），驗證只能靠 `javascript_tool` 讀 DOM，成本比一般手測更高。CDP 合成的 Enter 鍵也不會觸發表單的隱式送出，該路徑是改以 `form.requestSubmit()` 驗證、真實 Enter 由使用者複測確認。
- **現況（2026-07-23 更新，share2）**：`App.tsx` 新增的兩個 effect（分享線條的延後還原、狀態變動回寫 hash）同樣沒有元件測試涵蓋，純函式部分（`readShareHash`/`formatShareHash`/`toShare*` 轉換、`DrawingController.addLine()`）有 17 例單元測試。這次是用「手工組出含 2 條線的 hash → 在 dev server 上以 `javascript_tool` 讀 DOM 驗證」取代拖曳畫線，繞過了 canvas 互動測不了的限制。另記一個沙盒工具面的坑：Browser pane 對「只有 hash 不同」的網址不會重新載入文件（等同瀏覽器的 fragment 導航），`location.reload()` 實測也會把 hash 丟掉，要驗證「帶 hash 開新頁」必須讓網址在 hash 以外也有差異（例如加 `?r=1`）才會觸發真正的 document 載入。
- **現況（2026-07-23 更新，sidebar1/2/3）**：缺口再度擴大。側邊欄收合、區塊折疊、資料源切換、清單選取／刪除、折疊自動取消選取等互動同樣沒有元件測試，只有抽出的純函式（`lineSelection`、`lineLabel`、`applySubmittedCode`）有涵蓋。更嚴重的是**畫線相關端到端行為在沙盒內完全無法驗證**：Browser pane 為 hidden，CSS transition 與 rAF 凍結、canvas 不重繪、lightweight-charts 的 `subscribeCrosshairMove` 不觸發（實測對 container 與所有子元素派送合成 `mousedown`/`mousemove`/`mouseup` 都畫不出線），連第二個 pane 的 DOM row 與分隔線都要等實際 paint 才生成。因此「拖曳畫線 → 清單列出 → 點選高亮 → 刪除消失」只能靠使用者人工測。
- **現況（2026-07-23 更新，responsive1/2）**：斷點與佈局層的互動同樣沒有元件測試，只有 `useResponsive` 的 store 函式（`readBreakpoint`/`subscribeBreakpoint`，6 例，以 `vi.stubGlobal('window', …)` 假 MQL 驗證）與 `chipLabel.ts`（9 例）有涵蓋；`useLayoutEffect` 觸發 `ChartHandle.resize()`、`settingsOpen` 的斷點連動、圖例 chip 與參數小面板的互斥規則都靠手測。**另外發現 hidden pane 的凍結範圍比先前記錄的更廣**：`document.visibilityState === 'hidden'` 時整個 rendering steps 都不跑，因此 `requestAnimationFrame` 直接 timeout、`ResizeObserver` 回呼不觸發、**`matchMedia` 的 `change` 事件也不派送**（實測 `resize_window` 後 CSS media query 已套用、`matchMedia().matches` 已翻轉，但 React 收不到事件 → 佈局不切換），CSS transition 也不推進（側邊欄收合後 `getComputedStyle().width` 卡在起始值 260px，要暫時 `style.transition = 'none'` 才量得到終值 32px）。結論：**「拖曳視窗跨斷點」這類即時切換在沙盒內無法驗證**，只能「調整視窗尺寸 → 重新載入 → 量測初始渲染」，加上以程式化 `element.click()` 驅動互動後讀 DOM。
- **現況（2026-07-23 更新，share4/5）**：`ShareMenu` 的分支邏輯（剪貼簿成功／不支援／被拒、Web Share 成功／`canShare` 回 false／使用者取消／被拒、截圖回 `null` 的失敗路徑）同樣沒有元件測試，純函式部分（`imageShare` 的能力偵測與 `screenshot` 的編碼路徑）有 20 例單元測試。這次是在 dev server 上用 `javascript_tool` 側錄 `clipboard.write`／`canShare`／`share`／`HTMLAnchorElement.prototype.click`／`URL.createObjectURL`，再對每條分支各點一次按鈕來驗證——涵蓋度夠，但每次回歸都得重搭一次側錄，成本高且無法自動重跑。
- **建議**：加 `jsdom` + `@testing-library/react`（`vitest.config` 用 `environmentMatchGlobs` 只對元件測試切環境，避免拖慢既有純函式測試）。優先補的案例：↑/↓ 環繞、Enter 送出選取項、名稱查無時不呼叫 `onSubmit`、`stockNo` prop 變動同步輸入框、側邊欄折疊時清除選取、清單刪除呼叫 `ChartHandle.deleteLine`、`ShareMenu` 的 fallback 分支（stub 掉 `imageShare` 的能力偵測即可，不需要真的 canvas）。畫線本身（canvas 互動）即使加了 jsdom 也測不到，仍需人工。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。已明確知道缺口在哪、也已把可測邏輯盡量抽成純函式（`searchStocks`/`lineSelection`/`chipLabel`/`readShareHash` 等都有單元測試涵蓋），目前選擇維持人工手測。本則**保留在清單上持續累積**——每次新增互動邏輯就更新「現況」段落，讓缺口規模保持可見，日後決定要補時有現成的優先案例清單。
- **對應任務**：暫無（Skip）。

## 股票清單型別在 `scripts/` 與 `src/` 各自宣告一份

- **來源任務**：[symbol2](task-pool/symbol2.md)（2026-07-23）
- **狀況**：`Market` 與 `StockListEntry` 同時存在於 `web/scripts/stock-list/stockList.ts`（產出端）與 `web/src/lib/stock/types.ts`（消費端），內容相同但各自宣告。兩邊分屬 `tsconfig.node.json` 與 `tsconfig.app.json` 兩個編譯單元（`src/` 不能 import `scripts/`，否則 app 建置會把 Node 專用程式碼牽進來），所以不是單純忘了共用。
- **影響**：`stock-list.json` 的欄位若增減（例如未來加產業別、市場再細分），要同步改兩處；漏改一處不會有型別錯誤——消費端只是拿不到新欄位，或反過來把已消失的欄位當成必填而在 `isStockListEntry()` 把整份清單過濾成空，症狀是「搜尋突然什麼都找不到」而非編譯失敗。
- **建議**：真要共用的話，把型別抽到兩個 tsconfig 都納入的第三處（例如 `web/shared/stockList.types.ts`，純型別檔、無執行期程式碼），兩邊各自 `import type`。欄位穩定的現況下成本效益不高，可等實際要改欄位時再做。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。`stock-list.json` 的欄位目前穩定，共用要另開第三處純型別檔並同時調整兩個 tsconfig 的 include，成本效益不高。真的要增減欄位時再一併做——那也正是唯一會踩到這個坑的時機。
- **對應任務**：暫無（Skip）。

## ~~覆蓋式側邊欄的疊層依賴 lightweight-charts 內部寫死的 z-index~~（決策：不處理，2026-07-23）

- **決策：不處理（2026-07-23）**。接受與函式庫實作細節的耦合。這則無法真正「修好」，只能降低風險，而唯一徹底的解法（`layout: { panes: { enableResize: false } }` 關掉 pane 拖曳）會犧牲使用者調整量能 pane 高度的功能，已評估後決定保留該功能。數值已集中成 `--z-*` 變數且註解記下了函式庫的值，升級時能快速對照。此則關閉、不再追蹤。以下為原始紀錄。
- **來源任務**：[sidebar1](task-pool/sidebar1.md)（人工驗證後改為覆蓋式版面，2026-07-23）
- **狀況**：側邊欄改成絕對定位覆蓋在圖表之上（不擠壓版面、圖表不 resize），但圖表在側邊欄底下仍是滿版的，其內部元素會延伸到側邊欄下方。lightweight-charts 對這些元素寫死了 z-index：canvas 是 1/2、pane 分隔線拖曳把手是 49/50（`_addResizableHandle`，拖曳時另有一層 `position: fixed` 的 49 全螢幕背景）。我方必須把 `.sidebar` 設到 60、代號搜尋下拉設到 70 才不會被蓋住。這些數值已集中成 `web/src/index.css` 的 `--z-sidebar`/`--z-dropdown`（另有 `--z-chart-canvas`/`--z-chart-pane-handle` 兩個**僅供對照、不套用**的變數把函式庫的值寫進同一張順序表），但**順序關係本身仍依賴函式庫的實作細節**。
- **影響**：實際踩過兩次坑——側邊欄用 `z-index: 1` 時整片被 canvas 蓋住、所有點擊失效；改成 10 後仍留一條「隱形帶」，點在 pane 分隔線的 y 座標上會誤觸量能 pane 高度拖曳（症狀是點側邊欄的清單項卻拖動了圖表）。這類 bug 的表徵與成因距離很遠，排查成本高；若日後升級 lightweight-charts 且它調整了內部 z-index（或新增更高層的元素，例如 tooltip/浮層），同樣的問題會再次出現，且沒有任何自動化測試會攔到。
- **建議**：升級 lightweight-charts 時把「側邊欄各列（含 pane 分隔線所在 y）是否仍命中側邊欄元素」列為必測項（可用 `document.elementFromPoint` 快速檢查）。若不再需要調整量能 pane 高度，最徹底的解法是 `layout: { panes: { enableResize: false } }` 直接關掉 pane 拖曳，49/50 這層就不存在了（本次已評估，使用者決定保留拖曳功能）。
- **對應任務**：無（已關閉；升級 lightweight-charts 時仍建議用 `document.elementFromPoint` 抽查側邊欄各列是否仍命中側邊欄元素）。

## ~~三來源成交量口徑不一致（Yahoo 略低）~~（決策：不處理，2026-07-22）

- **來源任務**：[data6](task-pool/data6.md)
- **決策**：三來源量能口徑不同（Yahoo 不含盤後定價／鉅額交易，實測 2330 於 2024-09-02 TWSE 19,272,593 股 vs Yahoo 18,646,835 股，OHLC 一致）。經確認**依來源原樣顯示，不做正規化、不加 tooltip 註明**；[data7](task-pool/data7.md) 亦不做跨源標示。此則關閉、不再追蹤。

## ~~Yahoo 資料源不走 localStorage 月快取~~（決策：不處理，2026-07-23）

- **來源任務**：[data7](task-pool/data7.md)
- **決策**：`dataSource.fetchBars()` 對 Yahoo 走單次 `provider.fetchDaily()`（一次取回整段區間），因此不經 `fetchDailyRange()` 的逐月快取與月間節流，重查同一區間仍會實打上游一次。經確認**維持現狀、不做快取回填也不另行處理**：Yahoo 單次查詢成本低，且官方源的近月資料本來就不快取（當月一律視為過期），加快取並不能解決「短時間大量請求」的問題。請求頻率改以**代號送出的 300ms debounce**（`App.tsx` 的 `QUERY_DEBOUNCE_MS` + `lib/stock/selection.ts` 的 `applySubmittedCode`）控制：Enter／下拉選取／查詢鈕連打時只有最後一次真的發出，同代號重送為 no-op。此則關閉、不再追蹤。

## 截圖有同步／非同步兩條產生路徑，`ChartHandle` 也因此有兩個方法

- **來源任務**：[share5](task-pool/share5.md)（2026-07-23）
- **狀況**：同一張 PNG 有兩條產生路徑——`canvasToPngBlob()`（`toBlob`，非同步）給剪貼簿用，`canvasToPngBlobSync()`（`toDataURL` + 自解 base64，同步）給 Web Share 用；`ChartHandle` 對應曝光 `takeScreenshot()` 與 `takeScreenshotSync()`。這是刻意的：`ClipboardItem` 吃得下 `Promise<Blob>`，所以剪貼簿可以用非同步版不擋主執行緒；`navigator.share()` 不吃 promise 且對 transient user activation 嚴格（iOS Safari 尤其），中間插一個 `await` 就可能被拒，只能全程同步。兩者已實測產物一致（同尺寸、同 byte 數、同像素統計，見 [`docs/share.md`](../docs/share.md)）。
- **影響**：目前無行為差異，但截圖選項或後處理（例如日後加浮水印、加標題列、改底色策略）要改時得記得改兩處；漏改一處會造成「複製出來的圖」與「分享出去的圖」不一致，而且這種不一致只在其中一條路徑上看得到，不容易發現。
- **建議**：兩個方向。(1) 若日後實測確認 Safari 對「`await toBlob` 後再 `share()`」其實可接受，就砍掉同步版統一走非同步。(2) 若要保留兩條，把差異縮到只剩最後一步編碼——目前 `takeChartScreenshotCanvas()` 已是共用的前半段（截圖 + 補底色），後處理一律加在那裡，兩個 `canvasToPngBlob*()` 維持「只做編碼」的單一職責即可。目前已符合 (2) 的結構，維護時守住這條界線就好。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。採方向 (2)——結構本身已經是對的，差異縮到只剩最後一步編碼。方向 (1)（統一走非同步）需要真機確認 iOS Safari 的 user activation 判定，而真機驗證已決定不做，風險過高。**維護守則**：任何截圖後處理（浮水印、標題列、底色策略）一律加在共用的 `takeChartScreenshotCanvas()`，不要加進兩個 `canvasToPngBlob*()`。
- **對應任務**：暫無（Skip）。

## ~~Web Share 只在 stub 下驗證，真機（iOS Safari／Android Chrome）未測~~（決策：不處理，2026-07-23）

- **決策：不處理（2026-07-23）**。真機驗證需要實體裝置、無法在開發流程內自動化，接受 stub 對**分支邏輯**的覆蓋度。所有失敗路徑最終都會退回下載（`AbortError` 除外，那是使用者主動取消），最壞情況是行動裝置拿到下載檔而非系統分享面板，功能不會完全失效。此則關閉、不再追蹤。以下為原始紀錄。
- **來源任務**：[share5](task-pool/share5.md)（2026-07-23）
- **狀況**：沙盒的 Chromium 原生**沒有** `navigator.share`／`navigator.canShare`，因此「分享成功」「使用者取消（`AbortError`）」「被拒（`NotAllowedError`）」「`canShare` 回 false」四條分支都是用 stub 模擬驗證的（真實驗到的只有「完全沒有 Web Share → 退回下載」那條）。share5 驗收方式 1（真機叫出系統分享面板、分享到 LINE）尚未執行。
- **影響**：stub 驗的是**我們的分支邏輯**，驗不到平台行為——最可能出問題的兩點都在 stub 之外：iOS Safari 對 user activation 的實際判定（同步截圖約 82 ms 是否仍在可接受範圍）、以及各家 App 對 `image/png` 檔案分享的支援程度。若真機失敗，症狀會是「按了沒反應」或直接跳下載，使用者不會知道原因。
- **建議**：真機補測 iOS Safari 與 Android Chrome 各一次，重點看：分享面板是否叫得出來、LINE 是否收得到圖、按取消後是否**沒有**多出下載檔。若 iOS 因 activation 被拒，可考慮改成「先在 idle 時預先截好一張放著、click 時直接用」的預熱策略，或退而求其次讓行動裝置也走下載。
- **對應任務**：無（已關閉）。

## 斷點 1024px 在 JS 與 CSS 各寫一份，且邊界重疊（正好 1024px 時兩邊同時成立）

- **來源任務**：[responsive1](task-pool/responsive1.md)（2026-07-23）
- **狀況**：`hooks/useResponsive.ts` 用 `(min-width: 1024px)` 判定桌面版；`web/src/index.css` 既有的字級調整用 `@media (max-width: 1024px)` 判定行動版。兩者都寫死 1024，但**邊界方向相反且都含等號**——視窗**正好 1024px** 時，JS 認定 `desktop`（跑桌面佈局、完整工具列），CSS 卻同時套用行動版字級（`font-size: 16px`、`h1`/`h2` 縮小）。CSS media query 無法讀 JS 常數（`DESKTOP_MIN_WIDTH`），反之亦然，目前沒有共用來源。
- **影響**：只有 1024px 這一個寬度會出現「桌面佈局配行動字級」的混搭，視覺上只是字略小，不影響功能；實測 1024×768 佈局判定與圖表尺寸都正確。真正的風險是日後調整斷點時**只改一邊**——JS 改成 1280 而 CSS 留在 1024，會出現一段「桌面佈局但字級已縮小」的區間，而且沒有任何測試會攔到。
- **建議**：兩個方向。(1) 把 CSS 那側改成 `@media (max-width: 1023.98px)`，讓邊界互斥（成本最低，先解掉重疊）。(2) 若日後斷點會再調整，改由 JS 單一來源驅動——`useResponsive` 已經把斷點掛成 `.app-desktop`/`.app-mobile` class，字級規則可改寫成 `.app-mobile { font-size: 16px }` 之類的 class 選擇器，CSS 就不必再有自己的 media query。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。現況影響僅止於 1024px 這一個寬度的字級略小，不影響功能；真正的風險（改斷點只改一邊）只有在真的要調斷點時才會實現，屆時一併處理即可。**若日後調整斷點，記得同時改 `useResponsive.ts` 的 `DESKTOP_MEDIA_QUERY` 與 `index.css` 的三處 `@media (max-width: 1024px)`。**
- **對應任務**：暫無（Skip）。

## ~~指標圖例的桌面版讓位靠 CSS class 與側邊欄寬度硬耦合~~（決策：不處理，2026-07-23）

- **決策：不處理（2026-07-23）**。接受現行 CSS 耦合。側邊欄寬度維持展開／收合兩態就不會失準，而「改成可拖曳調寬」或「行動版改抽屜」都不在規劃中；真的要做時，改由 `Sidebar` 寫 `--settings-inset` 的方案本身就是那次改動的一部分，不需要預先做。此則關閉、不再追蹤。以下為原始紀錄。
- **來源任務**：[responsive2](task-pool/responsive2.md)（2026-07-23）
- **狀況**：`.indicator-legend` 覆蓋在圖表左上角，桌面版必須往右讓開側邊欄才不會被蓋住。做法是 `App.tsx` 依 `settingsOpen` 在 `.app` 掛 `app-settings-open` class，`IndicatorLegend.css` 用 `.app-desktop .indicator-legend` / `.app-desktop.app-settings-open .indicator-legend` 兩條規則在 `calc(var(--sidebar-collapsed-width) + 8px)` 與 `calc(var(--sidebar-width) + 8px)` 之間切換 `padding-left`。寬度變數已提到 `index.css` 的 `:root` 與 `Sidebar.css` 共用，但「圖例要知道側邊欄現在多寬」這件事本身仍是跨元件的隱性耦合。
- **影響**：目前側邊欄寬度固定兩態，運作正常（實測展開 268px／收合 40px，chip 起點分別為 x=268.6／40.6）。但若日後側邊欄改成可拖曳調寬、或行動版改用側邊抽屜，這兩條規則會靜默失準——症狀是前幾個 chip 被側邊欄蓋住、點不到，不會有任何錯誤訊息。另外 `.app-settings-open` 這個 class 目前只有圖例在用，很容易在重構時被誤刪。
- **建議**：若側邊欄寬度變成動態的，改由 `Sidebar` 把目前寬度寫進 `.app` 的 CSS 變數（例如 `--settings-inset`），圖例只讀那個變數，耦合方向就從「圖例猜側邊欄」變成「側邊欄宣告自己佔多寬」。在寬度維持兩態的現況下不值得先做。
- **對應任務**：無（已關閉；`.app-settings-open` 這個 class 目前只有 `IndicatorLegend.css` 在用，重構時勿誤刪）。

## ~~設定面板與參數小面板缺鍵盤關閉與焦點管理~~（決策：不處理，2026-07-23）

- **決策：不處理（2026-07-23）**。目標使用者以滑鼠與觸控為主，兩者皆不受影響；面板刻意設計為非模態（無遮罩、開著仍看得到並操作得到圖表），而完整的 modal 焦點處理與這個設計相衝突。此則關閉、不再追蹤。以下為原始紀錄。
- **來源任務**：[responsive2](task-pool/responsive2.md)（2026-07-23）
- **狀況**：`OverlayPanel`（行動版設定）與 `IndicatorLegend` 的參數小面板都刻意做成**非模態**（無遮罩、不鎖捲動、面板開著仍看得到並操作得到圖表），但也因此沒有做任何焦點處理：開啟時焦點不會移進面板、關閉後不會還原到觸發按鈕、Tab 可以跑到底下被覆蓋的圖表工具列、**沒有 Esc 關閉**。目前只能點面板上的 `✕`（或再點一次觸發鈕／同一個 chip）關閉。
- **影響**：滑鼠與觸控使用者不受影響；純鍵盤／螢幕閱讀器使用者在行動版設定面板開啟後，Tab 順序會與視覺順序脫節（面板在 DOM 中位於 header 之後、圖表之前，實際上覆蓋全區），且沒有慣用的 Esc 逃生路徑。
- **建議**：成本很低的兩步：(1) 兩個面板各加一個 `keydown` 監聽，`Escape` 時呼叫 `onClose`；(2) 開啟時把焦點移到面板標題（`tabIndex={-1}` + `focus()`），關閉時還原到觸發按鈕。真要做完整 modal（focus trap + `aria-modal`）則與「非模態、要能同時看圖」的設計相衝突，不建議。
- **對應任務**：無（已關閉）。

## 分享連結的線條還原綁在「第一批 bars 到位」，首查失敗後可能把線畫到別支股票上

- **來源任務**：[share2](task-pool/share2.md)（2026-07-23）
- **狀況**：`App.tsx` 把解出的 `lines` 放進 `pendingLinesRef`，由一個依賴 `[bars]` 的 effect 在 `bars.length > 0` 時一次補上（延後是必要的：`ChartContainer` 在 `stockNo` 變動含首次掛載時會 `clearAll()`，太早加會被清掉）。但這個 pending **沒有綁定「當初要還原的是哪支股票」**：若還原當下的查詢失敗（`error` 分支不 render `ChartContainer`，`chartRef` 為 null），pending 會一直留著，使用者接著改查另一支股票、資料成功到位時，這批線就會被畫到**新的股票**上。
- **影響**：需要「開分享連結 → 第一次查詢失敗 → 不重新整理直接改查別支」這串操作才會觸發，日常不易遇到；症狀是線條出現在不相干的股票上（座標仍是原本的 time/price，位置多半明顯不合理）。另一個較小的副作用：pending 未清空期間 hash 同步被擋住，網址不會跟著使用者的操作更新。
- **建議**：把 pending 改成 `{ stockNo, lines }`，還原 effect 先比對 `stockNo` 相符才補線、不符就直接丟棄 pending（並解除 hash 同步的封鎖）。改動集中在 `App.tsx` 的兩個 effect，成本很低，等有元件測試環境時可一併補上回歸測試。
- **決策（2026-07-23）**：**實作**。這是本次盤點中唯一確定存在的功能性 bug，雖然觸發路徑狹窄，但修法明確、改動集中在 `App.tsx` 兩個 effect、成本很低，沒有理由留著。
- **對應任務**：[share6](task-pool/share6.md)。

## ~~觸控畫線手勢只在 fake `TouchEvent` 下驗證，真機（iOS Safari／Android Chrome）未測~~（決策：不處理，2026-07-23）

- **決策：不處理（2026-07-23）**。與上面的 Web Share 真機驗證同一個理由——需要實體裝置、無法納入開發流程，接受 fake event 對**分支邏輯**的覆蓋度。此則關閉、不再追蹤。以下為原始紀錄。
- **來源任務**：[responsive3](task-pool/responsive3.md)（2026-07-23）
- **狀況**：沙盒的 Browser pane 不合成畫面（`document.visibilityState === 'hidden'`），既截不了圖也產不出真實的觸控事件序列（`computer` 的 drag 動作在 canvas 上一律 timeout，drawing1 起就是如此）。responsive3 的多指防呆因此改用 `drawingController.test.ts` 的 fake `TouchEvent`（只有 `touches.length` + 第一指座標 + `preventDefault`）覆蓋四條路徑，CSS 面（`touch-action: none`、44px 觸控目標）則以 `javascript_tool` 量測 computed style 與 `getBoundingClientRect()`。responsive3 的驗收條件 1–3（真機單指平移／雙指縮放、畫線模式單指拖曳不誤觸平移、模式提示是否夠清楚）全部尚未執行。
- **影響**：fake event 驗的是**我們的分支邏輯**，驗不到平台行為——驗不到的部分包括：iOS Safari 對 `touch-action: none` 與 lightweight-charts 內建 tracking mode 的實際互動、第二指落下時真實裝置送出的事件順序（`touchstart` 與 `touchmove` 的先後、是否夾帶 `touchcancel`）、以及 44px 在實際指腹下是否真的夠用。若真機行為與假設不符，症狀會是「畫線畫到一半突然變成平移」或「線莫名歪掉」這類難以從程式碼看出的問題。
- **建議**：真機各測一次，重點三項：(1) 非畫線模式單指平移＋雙指縮放仍正常；(2) 畫線模式下故意在拖曳中補第二指，確認**不會**留下一條歪線；(3) 連續畫 3 條線確認 drawing5 修掉的座標偏移沒有回歸。若第二指的事件順序與假設不同，`isMultiTouch()` 的攔截點可能要往 `touchcancel` 補一份。
- **對應任務**：無（已關閉）。

## 44px 觸控目標散在三個 CSS 檔，靠後代選擇器涵蓋，新增行動版 UI 時容易漏掉

- **來源任務**：[responsive3](task-pool/responsive3.md)（2026-07-23）
- **狀況**：行動版的 ≥44px 觸控目標由三條後代選擇器提供——`.app-header-mobile`（`AppLayout.css`）、`.overlay-panel-body`（`OverlayPanel.css`）、`.app-mobile .indicator-legend`（`IndicatorLegend.css`）。選用後代選擇器是刻意的（沿用既有的斷點 class，不必再抄一份 1024px），但代價是「哪些容器有 44px 保護」變成一份沒有寫在任何一處的隱性清單，且每條規則都得各自重複 `box-sizing: border-box`、`input:not([type='radio'])` 排除、`button` 的 `min-width` 這幾個細節。
- **影響**：目前三個容器已涵蓋行動版所有可點元素（實測 390×844 逐一量測通過）。但日後若新增一個不在這三個容器內的行動版 UI（例如放在圖表上的浮動按鈕、或新的覆蓋層），它不會自動獲得 44px，而且**不會有任何錯誤或警告**，只能靠人工量測發現。
- **建議**：抽一個共用的 `.touch-target` utility class（或 CSS `@mixin` 等價物：在 `index.css` 定義一組宣告，各處 `@extend`／複製一行 class 名）放進 `index.css`，讓「這是觸控目標」變成明確標記而非容器繼承。現有三條規則可保留為 fallback。等到行動版真的多出第四個容器時再做，現在抽會是為單一使用情境過度設計。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。現在抽 utility class 是為單一使用情境過度設計。**新增行動版 UI 時的檢查點**：若新元件不在 `.app-header-mobile`／`.overlay-panel-body`／`.app-mobile .indicator-legend` 三個容器之內，需自行確保 ≥44px（此時就是抽 `.touch-target` 的時機）。
- **對應任務**：暫無（Skip）。
