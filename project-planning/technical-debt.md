# Technical Debt

## ChartContainer 指標 reconcile 邏輯對每個已掛載實例無條件呼叫 update()，未做變更診斷

- **來源任務**：[indicator5](task-pool/indicator5.md)
- **狀況**：`ChartContainer.tsx` 的指標 reconcile `useEffect`（依賴 `[data, indicators]`）在每次觸發時，對所有已掛載的指標實例都呼叫 `handle.update(data, instance.params)`，不論該實例的 `params` 是否真的變動、或變動的是不是別的實例。這是刻意選擇的簡化實作（避免對 `IndicatorInstance` 做深層比較），目前每個指標的 `compute()` 都是輕量純函式（MA 的簡單移動平均），重複呼叫成本可忽略。
- **影響**：目前規模下沒有可觀察的效能問題。但當已掛載指標數量變多、或未來加入 `compute()` 較重的指標（例如需要大量歷史資料的複雜運算）時，調整單一實例參數會連帶重算並重繪其他未變動的指標，可能造成不必要的效能開銷與圖表閃爍。
- **建議**：若未來觀察到效能問題，可在 `IndicatorInstance` 或 reconcile 邏輯中加入變更偵測（例如比對 `params` 的淺層 diff 或維護 `IndicatorInstance` 的版本號/參考相等性判斷），只對實際變動的實例呼叫 `update()`。

## ChartContainer 圖表配色寫死，未跟隨 light/dark 主題

- **來源任務**：[chart1](task-pool/chart1.md) / [chart2](task-pool/chart2.md)
- **狀況**：`web/src/index.css` 已用 `prefers-color-scheme` 定義 `--bg`/`--text`/`--border` 等 CSS variable 供 light/dark 兩套配色，但 `ChartContainer.tsx` 的 `createChart` 選項（`layout.textColor`、`grid` 線色）與量能柱 `UP_COLOR`/`DOWN_COLOR` 都是寫死的 hex 常數，不會隨系統主題切換。lightweight-charts 是 canvas 渲染，CSS variable 無法直接套用，需要 JS 端讀取目前主題再呼叫 `chart.applyOptions()`。
- **影響**：目前介面沒有主題切換 UI，尚未有可觀察的視覺錯誤；但 responsive/RWD 模組（`responsive1`）或任何未來的主題切換功能上線後，圖表本身會維持深色配色不跟著換，造成視覺不一致。
- **建議**：實作淺色主題支援時，改用 `window.matchMedia('(prefers-color-scheme: dark)')`（或未來的主題 state）在 `ChartContainer` 內動態算出色票，並在偵測到主題變化時呼叫 `chart.applyOptions({ layout, grid })` 更新，同時同步更新量能柱 `UP_COLOR`/`DOWN_COLOR`。

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
