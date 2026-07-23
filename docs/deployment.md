# 部署設定（GitHub Pages）

## 專案骨架

- 路徑：`web/`（React + Vite + TypeScript）
- GitHub repo 名稱：`ta-painter`
- `vite.config.ts` 的 `base` 設為 `/ta-painter/`，對應 GitHub Pages 的專案頁面路徑

## 部署流程

`.github/workflows/deploy-pages.yml`：

- 觸發條件：push 到 `main` 且變更檔案落在 `web/**`（或手動 `workflow_dispatch`、或被其他 workflow 以 `workflow_call` 呼叫）
- 步驟：`actions/checkout` → `actions/setup-node`（Node 20）→ `npm ci`（工作目錄 `web/`）→ `npm run build` → `actions/upload-pages-artifact`（`web/dist`）→ `actions/deploy-pages`
- 權限：`contents: read`、`pages: write`、`id-token: write`；`concurrency` group 避免同時多次部署
- `workflow_call` 帶一個選填的 `ref` input，決定 `actions/checkout` 要建置哪個 ref；留空即維持原本「建置觸發本次執行的 commit」行為

## 股票清單自動更新流程

`.github/workflows/update-stock-list.yml`：每週抓取上市／上櫃清單寫入 `web/public/stock-list.json`，有異動才 commit，並直接呼叫上面的 `deploy-pages.yml`（`ref: main`）發佈——因為 GITHUB_TOKEN 推出的 commit 不會觸發其他 workflow。此流程用 Node 24（直接執行 `.ts` 需要內建型別剝除），與 Pages 建置用的 Node 20 各自獨立。細節見 [stock-list.md](./stock-list.md)。

## 本機開發

```bash
cd web
npm install
npm run dev      # http://localhost:5173/ta-painter/
npm run build    # 產出 web/dist
npm run test     # vitest run
npm run lint     # oxlint
```

`npm run update-stock-list`（手動重跑股票清單抓取）另需 Node `>=22.6`，見 [stock-list.md](./stock-list.md)。

## Node 版本需求

本機 Node 需 `>=20.19.0`（`web/package.json` 依賴 `vite@^8.1.5` + rolldown 原生 binding，低版本 Node 會出現 `Cannot find native binding` 錯誤）。曾一度為繞過此問題暫時降版 `vite`/`@vitejs/plugin-react`，已於本機升級 Node 後恢復為 scaffold 預設版本，詳見 [technical-debt.md](../project-planning/technical-debt.md)。
