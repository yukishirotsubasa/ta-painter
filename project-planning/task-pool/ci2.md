# ci2 — worker CI 測試 gate

## 說明

新增只監聽 `worker/**` 的 GitHub Actions workflow（比照 web 的 `deploy-pages.yml` 只監聽 `web/**`），push 前跑 `deno task test`（必要時加 `deno check main.ts`）。即使不阻擋 Deno Deploy 的自動部署，也能在 push 後盡快標紅發現錯誤。

## 依賴

無。

## 驗收方式

1. worker 測試失敗時 CI 標紅。
2. worker 測試通過時 CI 綠燈；僅變更 `web/**` 不觸發此 workflow。
