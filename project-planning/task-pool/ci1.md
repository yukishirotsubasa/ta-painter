# ci1 — web 型別檢查 CI gate

## 說明

建立 commit/push 前的型別檢查防線，避免「過 test 但過不了 `tsc -b`」再次發生（曾致部署失敗）。二擇一或並用：(a) Husky pre-commit hook 跑 `tsc -b`；(b) 新增監聽非 `main` 分支 push/PR 的 GitHub Actions workflow 跑 `npm run build`（含 `tsc -b`）。

## 依賴

無。

## 驗收方式

1. 故意引入型別錯誤時，pre-commit 或 CI 會失敗擋下。
2. 正常變更能通過檢查。

## 實作結果（2026-07-24，完成）

兩個原方案都未採用。開發流程只在 `main` 上作業、不開分支，所以 (b) 的非-`main` 分支 CI 觸發不到；`main` push 的 CI 就是既有的 `deploy-pages.yml`（已跑 `npm run build`），再加一個等於重複且一樣要等 push 後才知道。husky 則需要在沒有 package.json 的 repo root 新增一份。

改為**版本控管的 git hook**：

- `.githooks/pre-push`：從 pre-push 的 stdin 算差異範圍，本次 push 動到 `web/` 才跑 `npm run typecheck`（`tsc -b`），失敗即中止 push
- `.githooks/README.md`：啟用說明
- `web/package.json` 新增 `"typecheck": "tsc -b"`
- 啟用方式：`git config core.hooksPath .githooks`（每個 clone 一次）；略過：`git push --no-verify`

驗收：(1) 注入 `const x: number = "boom"` → 印 TS2322、exit 1 擋下；(2) 正常變更通過；(3) 只動 `project-planning/` 時短路放行不跑編譯。行為細節見 `docs/deployment.md`。
