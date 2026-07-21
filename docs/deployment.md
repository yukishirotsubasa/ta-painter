# 部署設定（GitHub Pages）

## 專案骨架

- 路徑：`web/`（React + Vite + TypeScript）
- GitHub repo 名稱：`ta-painter`
- `vite.config.ts` 的 `base` 設為 `/ta-painter/`，對應 GitHub Pages 的專案頁面路徑

## 部署流程

`.github/workflows/deploy-pages.yml`：

- 觸發條件：push 到 `main` 且變更檔案落在 `web/**`（或手動 `workflow_dispatch`）
- 步驟：`actions/checkout` → `actions/setup-node`（Node 20）→ `npm ci`（工作目錄 `web/`）→ `npm run build` → `actions/upload-pages-artifact`（`web/dist`）→ `actions/deploy-pages`
- 權限：`contents: read`、`pages: write`、`id-token: write`；`concurrency` group 避免同時多次部署

## 本機開發

```bash
cd web
npm install
npm run dev      # http://localhost:5173/ta-painter/
npm run build    # 產出 web/dist
npm run test     # vitest run
npm run lint     # oxlint
```

## Node 版本需求

本機 Node 需 `>=20.19.0`（`web/package.json` 依賴 `vite@^8.1.5` + rolldown 原生 binding，低版本 Node 會出現 `Cannot find native binding` 錯誤）。曾一度為繞過此問題暫時降版 `vite`/`@vitejs/plugin-react`，已於本機升級 Node 後恢復為 scaffold 預設版本，詳見 [technical-debt.md](../project-planning/technical-debt.md)。
