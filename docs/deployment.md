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
```

## Node 版本相依限制

`web/package.json` 將 `vite` 釘在 `^6.4.3`、`@vitejs/plugin-react` 釘在 `^4.7.0`（而非 scaffold 預設的 `vite@8` + rolldown）。原因見 [technical-debt.md](../project-planning/technical-debt.md)。
