# Technical Debt

## vite 降版至 ^6.4.3（未使用 scaffold 預設的 vite@8 / rolldown）

- **來源任務**：[infra1](task-pool/infra1.md)
- **狀況**：`npm create vite@latest web -- --template react-ts` 預設產出 `vite@^8.1.1` + `@vitejs/plugin-react@^6.0.3`（vite 8 底層改用 rolldown）。在本機 Node v20.15.1 + Windows 上執行 `npm run build` 時報錯：
  ```
  Error: Cannot find native binding.
  Cannot find module '@rolldown/binding-win32-x64-msvc'
  ```
  重新 `rm -rf node_modules package-lock.json && npm install` 無法修復，判斷是 rolldown 原生 binding 在此環境下的相容性問題，而非單純 optional dependency 快取問題。
- **處理方式**：暫時將 `vite` 降到 `^6.4.3`、`@vitejs/plugin-react` 降到 `^4.7.0`（回到 esbuild/rollup 傳統流程），本機 `dev`/`build` 皆已驗證正常。
- **影響**：目前功能不受影響，但落後 scaffold 最新版本一個大版號，未來新增設定時要注意 vite 6 與 vite 8 的 API/預設值差異（例如 rolldown 的 build 選項不適用）。
- **後續建議**：
  - 待本機開發環境升級 Node 到 `^20.19.0` 或 `>=22.12.0` 後，可重新嘗試升級回 `vite@8`（rolldown-vite），評估 build 效能提升是否值得。
  - 若持續使用 vite 6，定期關注其 EOL/安全更新狀態。
  - `oxlint` 目前釘在 `^1.71.0`，同樣要求 Node `^20.19.0 || >=22.12.0`，本機執行 `npm run lint` 可能因 Node 版本觸發 EBADENGINE 警告（非致命，CI 未跑 lint step，暫不影響部署）。若要在 CI 或本機啟用 lint，需一併確認 Node 版本。
