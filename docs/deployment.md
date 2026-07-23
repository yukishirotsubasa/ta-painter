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
npm run build      # 產出 web/dist
npm run typecheck  # tsc -b（不產出 bundle，pre-push hook 用的就是這個）
npm run test       # vitest run
npm run lint       # oxlint
```

`npm run update-stock-list`（手動重跑股票清單抓取）另需 Node `>=22.6`，見 [stock-list.md](./stock-list.md)。

## 型別檢查 gate（pre-push hook）

repo 內附版本控管的 git hooks 於 `.githooks/`，git 預設不會使用，**每個 clone 需執行一次**：

```bash
git config core.hooksPath .githooks
```

`.githooks/pre-push` 的行為：

- 讀 pre-push 由 stdin 傳入的 `<local ref> <local sha> <remote ref> <remote sha>`，用 `git diff --name-only <remote sha> <local sha> -- web/` 判斷本次 push 的 commit 有沒有動到 `web/`；沒動到就直接放行（不花時間跑編譯）
- 遠端尚未存在該分支（`remote sha` 為全 0）時無從算差異範圍，一律檢查；刪除遠端分支（`local sha` 為全 0）則跳過
- 需要檢查時執行 `npm run typecheck`（即 `tsc -b`，工作目錄 `web/`），失敗即以非零狀態中止 push；`web/node_modules` 不存在時直接報錯提示先跑 `npm ci`
- 緊急略過：`git push --no-verify`

零 npm 依賴（不使用 husky，repo root 也沒有 package.json）。檢查對象是 **working tree 目前的檔案內容**，不是即將 push 的 commit 快照——有未提交的髒改動時，結果會反映髒改動。

存在理由：`npm test`（vitest）不跑型別檢查，曾發生「測試全過但 `tsc -b` 不過」的 commit 進到 `main`，直到 Pages 部署才失敗（見 [technical-debt.md](../project-planning/technical-debt.md)）。此 hook 把該防線移到 push 前。

## worker CI 測試 gate

`.github/workflows/worker-ci.yml`：

- 觸發條件：push 到 `main` 或 PR，且變更檔案落在 `worker/**`（或 workflow 檔自身）；另可手動 `workflow_dispatch`。只動 `web/**` 不會觸發
- 步驟：`actions/checkout` → `denoland/setup-deno@v2`（`deno-version: v2.x`）→ `deno task check` → `deno task test`，工作目錄固定 `worker/`
- 權限只有 `contents: read`；`concurrency` group 依 ref 取消同分支的舊 run
- 注意：`worker/` 由 Deno Deploy 的 GitHub 連動自動部署，這支 workflow **不會阻擋部署**，只是讓測試／型別錯誤在 push 後盡快標紅（見 [proxy.md](./proxy.md) 與 [technical-debt.md](../project-planning/technical-debt.md)）

worker 相關指令（工作目錄 `worker/`，需本機安裝 Deno 2）：

```bash
deno task dev    # deno run --allow-net --allow-env --watch main.ts
deno task check  # deno check main.ts handler_test.ts
deno task test   # deno test
```

`check` 顯式列出 `handler_test.ts`，因為測試檔不在 `main.ts` 的 import graph 內，只寫 `deno check main.ts` 檢查不到。

## Node 版本需求

本機 Node 需 `>=20.19.0`（`web/package.json` 依賴 `vite@^8.1.5` + rolldown 原生 binding，低版本 Node 會出現 `Cannot find native binding` 錯誤）。曾一度為繞過此問題暫時降版 `vite`/`@vitejs/plugin-react`，已於本機升級 Node 後恢復為 scaffold 預設版本，詳見 [technical-debt.md](../project-planning/technical-debt.md)。
