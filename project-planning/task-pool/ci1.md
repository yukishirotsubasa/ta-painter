# ci1 — web 型別檢查 CI gate

## 說明

建立 commit/push 前的型別檢查防線，避免「過 test 但過不了 `tsc -b`」再次發生（曾致部署失敗）。二擇一或並用：(a) Husky pre-commit hook 跑 `tsc -b`；(b) 新增監聽非 `main` 分支 push/PR 的 GitHub Actions workflow 跑 `npm run build`（含 `tsc -b`）。

## 依賴

無。

## 驗收方式

1. 故意引入型別錯誤時，pre-commit 或 CI 會失敗擋下。
2. 正常變更能通過檢查。
