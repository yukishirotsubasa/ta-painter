# infra2 — Cloudflare Worker CORS Proxy

## 說明

建立 `worker/` 獨立專案，實作 `/proxy/{tpex|yahoo}/...` 路徑轉發，host allowlist 限制在 `www.tpex.org.tw` 與 `query1.finance.yahoo.com`，不接受任意 `?url=` 目標。回應加上 `Access-Control-Allow-Origin` 等 CORS header。用 `wrangler.toml` 設定並 `wrangler deploy` 部署。

## 依賴

無。

## 驗收方式

1. `wrangler dev` 本機測試 `/proxy/tpex/...` 與 `/proxy/yahoo/...` 均能正確轉發並回傳資料。
2. 部署後用 `curl -H "Origin: https://example.github.io" <worker-url>/proxy/tpex/...` 與 `/proxy/yahoo/...`，確認回應帶 `access-control-allow-origin` header 且資料正確。
3. 打不在 allowlist 內的路徑，確認回傳 404（驗證不是開放代理）。
