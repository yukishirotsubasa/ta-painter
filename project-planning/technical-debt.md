# Technical Debt

## ChartContainer 指標 reconcile 邏輯對每個已掛載實例無條件呼叫 update()，未做變更診斷

- **來源任務**：[indicator5](task-pool/indicator5.md)
- **狀況**：`ChartContainer.tsx` 的指標 reconcile `useEffect`（依賴 `[data, indicators]`）在每次觸發時，對所有已掛載的指標實例都呼叫 `handle.update(data, instance.params)`，不論該實例的 `params` 是否真的變動、或變動的是不是別的實例。這是刻意選擇的簡化實作（避免對 `IndicatorInstance` 做深層比較），目前每個指標的 `compute()` 都是輕量純函式（MA 的簡單移動平均），重複呼叫成本可忽略。
- **影響**：目前規模下沒有可觀察的效能問題。但當已掛載指標數量變多、或未來加入 `compute()` 較重的指標（例如需要大量歷史資料的複雜運算）時，調整單一實例參數會連帶重算並重繪其他未變動的指標，可能造成不必要的效能開銷與圖表閃爍。
- **建議**：若未來觀察到效能問題，可在 `IndicatorInstance` 或 reconcile 邏輯中加入變更偵測（例如比對 `params` 的淺層 diff 或維護 `IndicatorInstance` 的版本號/參考相等性判斷），只對實際變動的實例呼叫 `update()`。

## ChartContainer 圖表配色寫死，未跟隨 light/dark 主題

- **來源任務**：[chart1](task-pool/chart1.md) / [chart2](task-pool/chart2.md)
- **狀況**：`web/src/index.css` 已用 `prefers-color-scheme` 定義 `--bg`/`--text`/`--border` 等 CSS variable 供 light/dark 兩套配色，但 `ChartContainer.tsx` 的 `createChart` 選項（`layout.textColor`、`grid` 線色）與量能柱 `UP_COLOR`/`DOWN_COLOR` 都是寫死的 hex 常數，不會隨系統主題切換。lightweight-charts 是 canvas 渲染，CSS variable 無法直接套用，需要 JS 端讀取目前主題再呼叫 `chart.applyOptions()`。[macd.ts](../web/src/lib/chart/indicators/macd.ts) 的 DIF/DEA 線色（`#2196f3`/`#ff9800`）與 histogram 的漲跌色（各自重複定義一份 `UP_COLOR`/`DOWN_COLOR`，數值跟 `ChartContainer.tsx` 相同但沒有共用常數）同樣是寫死 hex，屬同一類問題。
- **影響**：目前介面沒有主題切換 UI，尚未有可觀察的視覺錯誤；但 responsive/RWD 模組（`responsive1`）或任何未來的主題切換功能上線後，圖表本身（含量能柱與 MACD histogram）會維持深色配色不跟著換，造成視覺不一致。另外 `ChartContainer.tsx` 與 `macd.ts` 各自定義一份相同數值的 `UP_COLOR`/`DOWN_COLOR`，未來調色只改一處會造成兩處不一致。
- **建議**：實作淺色主題支援時，改用 `window.matchMedia('(prefers-color-scheme: dark)')`（或未來的主題 state）動態算出色票，並在偵測到主題變化時對圖表與各指標的 series 呼叫對應的 `applyOptions()`/重新 `setData()` 更新；同時把 `UP_COLOR`/`DOWN_COLOR` 抽成共用常數（例如 `lib/chart/colors.ts`），讓 `ChartContainer.tsx` 與 `macd.ts` 共用同一份。

## PaneIndexAllocator 尚未驗證多個 separate-pane 指標同時存在的 index 一致性

- **來源任務**：[indicator4](task-pool/indicator4.md)
- **狀況**：`createPaneIndexAllocator()`（`lib/chart/paneIndexAllocator.ts`）只是邏輯上的計數器，並未對應 lightweight-charts 實際的 pane 陣列行為——當一個 pane 內最後一個 series 被移除時，lightweight-charts 會自動移除該 pane 並讓後面的 pane index 往前遞補，但 allocator 內部記錄的「已配置 index 集合」不會知道這件事。目前唯一的 separate-pane 指標是 MACD，已驗證「新增 → 移除 → 再新增」單一 MACD 實例時 pane index 分配正確（見 `docs/indicators.md` 手動驗證紀錄），但**尚未驗證兩個以上 separate-pane 指標同時存在、且移除中間那個時**，allocator 記錄的 index 是否仍對應 lightweight-charts 實際的 pane 陣列位置。
- **影響**：目前規模下（只有 MACD 一種 separate-pane 指標）不會觸發這個情境，沒有可觀察的錯誤。但未來若新增第二種 separate-pane 指標（例如 RSI），使用者同時掛載兩個 separate-pane 指標後移除較前面那個，allocator 釋放的 index 可能與 lightweight-charts 實際遞補後的 pane 位置不一致，導致後續 `mount()`/`update()` 操作到錯誤的 pane。
- **建議**：新增第二種 separate-pane 指標時，需實測「兩個 separate-pane 指標同時掛載 → 移除前面那個 → 檢查後面那個的 pane 是否還在正確位置」這個情境；若證實有錯位問題，需改為由 `ChartContainer` 直接查詢 `chart.panes()` 目前實際數量/位置來決定 index，而不是讓 allocator 自己維護獨立計數器。

## `ChartToolbar` 輸入框不會跟隨外部 `stockNo` 變化重新同步

- **來源任務**：[chart3](task-pool/chart3.md)
- **狀況**：`ChartToolbar.tsx` 用 `useState(stockNo)` 初始化本地 `draft` state，只在元件掛載當下取一次 `stockNo` prop 的值，之後 `stockNo` prop 變動不會反向同步回 `draft`（沒有對應的同步 `useEffect`）。目前唯一會改變 `stockNo` 的路徑就是這個元件自己的 `onSubmit`，所以 `draft` 與 `stockNo` 目前保證同步，沒有可觀察的問題。
- **影響**：[share2](task-pool/share2.md)（URL hash 還原）預計會在 `App.tsx` 用解碼出的股票代號呼叫 `setStockNo()`，屆時 `stockNo` 會被外部（非 `ChartToolbar` 自己）改變；`ChartToolbar` 的輸入框仍會顯示掛載當下的舊代號，即使圖表已經正確切換到還原後的新代號，造成輸入框顯示值與實際圖表資料不一致。
- **建議**：實作 share2 時，在 `ChartToolbar.tsx` 加一個 `useEffect(() => setDraft(stockNo), [stockNo])`，或改用「以 `stockNo` prop 直接控制 input 顯示、`draft` 只在使用者主動輸入時才 diverge」的完全受控寫法。

## 畫線選取的點擊命中容差太小，實測難以選中線條

- **來源任務**：[drawing4](task-pool/drawing4.md)
- **狀況**：`DrawingController`（`web/src/lib/chart/drawing/drawingController.ts`）的 `hitTestLines()` 目前是「由後往前找第一個命中就回傳」，命中判定委給 `TrendLinePrimitive.hitTest()`（`web/src/lib/chart/drawing/trendLinePrimitive.ts`），容差為 `HIT_TEST_TOLERANCE_PX = 6`（px）。使用者實測（真實瀏覽器，非本 repo 沙盒環境）回報：刪除單條線的功能可以正常運作，但線條太細，點擊很難準確選中。
- **影響**：選取刪除單條線的核心功能已可用（unit test 涵蓋選取/刪除/清除選取等情境），但實際操作體驗不佳，容易點擊落空或（多線交叉時）選錯線。
- **建議**：下次優化畫線模式時一併調整，已討論過的方向：
  1. 加大容差（例如 6→10~12px）並把 `hitTestLines()` 改成「取全部線中距離最小且 ≤ 容差」的那條，而非目前「由後往前第一個命中」；避免多線交叉時選錯。
  2. 在此之上疊加 hover 預覽：`onCrosshairMove` 目前只在 `dragging` 時處理，其實未按下滑鼠移動也會持續觸發 `subscribeCrosshairMove`，可以在未拖曳時也做 hit-test，滑到線附近就即時提示（游標變 `pointer`、線條 hover 高亮），讓使用者點擊前就知道會選到哪條。
  3. 另一個評估過但改動範圍明顯較大的方向：另外做一個「已畫線條清單」UI 面板，列出每條線並附刪除按鈕，完全不需要在畫布上精準點選；但需要把 `DrawingController` 內部的 `lines` 陣列曝光成可被 React 觀察（目前是純 imperative 黑盒、沒有任何回調），超出當初 drawing4 的 scope。

## 沒有本機 pre-commit/CI type-check，`main` 曾出現能過 test 但過不了 `tsc -b` 的 commit

- **來源任務**：[drawing4](task-pool/drawing4.md)（修正於本次 session，2026-07-22）
- **狀況**：drawing4 完成時（commit `9016432`）`TrendLinePrimitive.hitTest()` 回傳 `boolean`，但專案實裝的 `lightweight-charts@5.2.0` 型別要求 `ISeriesPrimitiveBase.hitTest` 回傳 `PrimitiveHoveredItem | null`。`npm test`（vitest）當時全數通過（測試只驗證行為，不跑型別檢查），但這個型別錯誤直到 push 後才被 GitHub Actions 的 `npm run build`（`tsc -b && vite build`，見 `.github/workflows/deploy-pages.yml`）攔下，導致部署失敗。本地沒有任何 pre-commit hook 或本機 CI 腳本會在 commit 前跑 `tsc -b`。已於本次 session 修正（`hitTest` 改回傳 `PrimitiveHoveredItem | null`，命中回傳 `{ cursorStyle: 'pointer', externalId: 'trend-line', zOrder: 'normal' }`，未命中回傳 `null`；`DrawingController.hitTestLines()` 改用 `!== null` 判斷），詳見 [`docs/drawing.md`](../docs/drawing.md)。
- **影響**：目前僅發生一次（型別錯誤，非邏輯錯誤，實際互動行為不受影響），但這個落差模式（本機只跑 `npm test` 就 commit，未跑 `npm run build`）未來仍可能重演，尤其是升級第三方套件版本（如 lightweight-charts）後型別介面變動時最容易中招，且要等 push 後才會在 CI 發現，拖慢回饋速度。
- **建議**：養成 commit/push 前跑一次 `npm run build`（或至少 `tsc -b`）的習慣；若要根治，可考慮加 Husky pre-commit hook 跑 `tsc -b`，或在 `deploy-pages.yml` 之外另建一個「PR/push 到非 main 分支」也會跑 `npm run build` 的 CI workflow，讓型別錯誤在合併前就被攔下而非等到部署才發現。

## ~~vite 降版至 ^6.4.3~~（已解決：2026-07-21 升級回 vite@8）

- **來源任務**：[infra1](task-pool/infra1.md)
- **狀況（歷史）**：`npm create vite@latest web -- --template react-ts` 預設產出 `vite@^8.1.1` + `@vitejs/plugin-react@^6.0.3`（vite 8 底層改用 rolldown）。在本機 Node v20.15.1 + Windows 上執行 `npm run build` 時報錯：
  ```
  Error: Cannot find native binding.
  Cannot find module '@rolldown/binding-win32-x64-msvc'
  ```
  重新 `rm -rf node_modules package-lock.json && npm install` 無法修復，判斷是 rolldown 原生 binding 在此環境下的相容性問題，而非單純 optional dependency 快取問題。當時暫時降版至 `vite@^6.4.3` + `@vitejs/plugin-react@^4.7.0` 繞過。
- **解決方式**：本機 Node 由 v20.15.1 手動升級至 `v20.20.2`（滿足 `^20.19.0` 需求）後，重新安裝依賴並升級：
  - `vite`: `^6.4.3` → `^8.1.5`
  - `@vitejs/plugin-react`: `^4.7.0` → `^6.0.3`
  - `rm -rf node_modules package-lock.json && npm install` 後，rolldown native binding 錯誤消失。
  - 驗證通過：`npm run build`（vite 8 rolldown 流程正常出圖）、`npm run lint`（oxlint 無 EBADENGINE 警告）、`npm run dev`（開發伺服器正常啟動）。
- **現況**：`vite`/`@vitejs/plugin-react`/`oxlint` 均已回到 scaffold 預設最新版本，無殘留技術債。
