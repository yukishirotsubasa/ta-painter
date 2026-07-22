# CORS Proxy（`worker/`）

> 本文件記錄 [infra2](../project-planning/task-pool/infra2.md) **已實作**的 CORS proxy 行為。原規劃見 `project-planning/design.md`；規劃與實際實作的落差（平台、URL 格式）也記錄在該文件對應章節。

## 為什麼不是 Cloudflare Worker

原規劃用 Cloudflare Worker。實作並部署後 `curl` 實測發現 **TPEx（`www.tpex.org.tw`）會擋 Cloudflare Workers 的出站 IP range**：不管請求帶什麼 `User-Agent`/`Referer`，一律 302 導到 `https://www.tpex.org.tw/errors`（甚至偶發 525 TLS handshake 失敗）；同一個網址從一般用戶網路直連、或從 Deno Deploy 出站都正常 200。Yahoo Finance 對 Cloudflare 沒有這個限制（只需要偽裝瀏覽器 `User-Agent` 就能避開 429）。

因此改用 **Deno Deploy**（`app.deno.com`，GitHub 連動自動部署，push 到 `main` 就會重新部署 `worker/` 目錄）。

## 為什麼 URL 格式是 `?path=` 而不是路徑透傳

Deno Deploy 部署後同樣用 `curl` 實測發現：**網址結尾像常見靜態資源副檔名的請求（例如 TPEx 舊版 API 的 `.php`）會被平台的靜態檔案層攔截**，直接回平台層級的 404（`server: deployd`，沒有我方 handler 加的 CORS header），根本不會呼叫到 `handleRequest()`。Yahoo 的路徑（如 `2330.TW`）沒有被攔截，因為 `.TW` 不是平台辨識的靜態資源副檔名。

為了讓任何上游路徑（包含 `.php`）都能穩定送進 handler，上游路徑改成透過 `path` query 參數傳遞，而不是直接接在我方路徑後面。

## API

```
GET /proxy/tpex?path=<url-encoded 上游路徑+query>
GET /proxy/yahoo?path=<url-encoded 上游路徑+query>
```

- `path` 必須以 `/` 開頭（相對路徑），否則回 404 —— 這是維持「不接受任意目標」限制的關鍵：不管 `path` 內容是什麼，一律只會被接到固定 allowlist 的 host 後面（`www.tpex.org.tw` / `query1.finance.yahoo.com`），無法讓呼叫端指定任意目標 host。
- 範例：查 TPEx 民國 113 年 9 月上櫃行情：
  ```
  /proxy/tpex?path=%2Fweb%2Fstock%2Faftertrading%2Fdaily_close_quotes%2Fstk_quote_result.php%3Fl%3Dzh-tw%26d%3D113%2F09
  ```
  （`path` 的原始值：`/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?l=zh-tw&d=113/09`）
- 非 GET/HEAD 方法回 405；`OPTIONS` 回 CORS preflight 空回應；不在 allowlist 內、缺少 `path`、或 `path` 不是 `/` 開頭一律回 404。
- 回應一律加上 `Access-Control-Allow-Origin: *` 等 CORS header（見 `worker/handler.ts` 的 `CORS_HEADERS`）。

## 上游偽裝 header（實測必要）

轉發上游請求時固定帶：

- `User-Agent`：桌面瀏覽器字串 — Yahoo Finance 對非瀏覽器 UA 一律回 429。
- `Referer`：`https://<上游 host>/` — 與 TPEx 的 `/errors` 導向問題無關（那是 IP range 被擋，headers 無法繞過），但保留作為一般反爬蟲措施的防護。
- `Accept-Language: zh-TW,zh;q=0.9`

`redirect: 'manual'`：不自動跟隨上游的 redirect（若上游改回導向錯誤頁，會直接把該次的 30x 回應轉發回呼叫端，而不是拋出「Too many redirects」例外）。

## 部署

- 專案：`worker/`（`main.ts` 為 Deno Deploy entrypoint、`handler.ts` 為核心邏輯、`handler_test.ts` 為 unit test）
- 本機開發：`deno task dev`（`deno run --allow-net --allow-env --watch main.ts`，監聽 `http://localhost:8000/`）
- 測試：`deno task test`（`deno test`，只驗證 `resolveProxyTarget()` 的路徑解析邏輯，不打真實網路）
- 正式部署：Deno Deploy 的 GitHub 連動（`app.deno.com` → New app → 選 `yukishirotsubasa/ta-painter` repo → entrypoint 填 `worker/main.ts`），push 到 `main` 就自動重新部署，**不需要**手動跑 CLI 部署指令，也沒有掛在 `.github/workflows/deploy-pages.yml` 上（那個 workflow 只監聽 `web/**`）。
- 目前正式網址：`https://ta-painter.yukishirotsubasa.deno.net`

## 已知限制

- Deno Deploy 的 GitHub 連動部署沒有跑 `deno task test` 當 gate，push 到 `main` 即使測試會失敗也照樣部署，詳見 [technical-debt.md](../project-planning/technical-debt.md)。
- 上游站台（TPEx／Yahoo）的反爬蟲/IP 封鎖規則不受我方控制，未來可能再次變化導致 proxy 失效，詳見 technical-debt.md。
