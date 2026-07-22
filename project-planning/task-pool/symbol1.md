# symbol1 — 每週股票清單 GitHub Actions

## 說明

新增 `.github/workflows/update-stock-list.yml`，每週排程（`schedule` cron，另附 `workflow_dispatch` 手動觸發）。在 GitHub runner（server 端，**無 CORS、不需 proxy**）抓取 TWSE 上市與 TPEx 上櫃股票清單（代號、名稱、市場別）：

- TWSE 上市：ISIN `https://isin.twse.com.tw/isin/C_public.jsp?strMode=2`（HTML 表格解析）或 TWSE OpenAPI。
- TPEx 上櫃：TPEx OpenAPI `https://www.tpex.org.tw/openapi/v1/...`（回傳代號+名稱 JSON）。

合併輸出為 `web/public/stock-list.json`（格式 `[{code, name, market}]`，`market` 為 `TWSE`/`TPEX`）。若內容有變則 commit 回 repo（一併觸發 Pages 部署發佈）。

## 依賴

無。

## 驗收方式

1. 手動 `workflow_dispatch` 執行成功，產出/更新 `web/public/stock-list.json`，內含上市與上櫃代號、名稱、市場別。
2. 抽查數檔知名代號（上市 2330、任一上櫃代號）名稱與市場別正確。
3. 排程設定為每週執行；清單無變動時不產生空 commit。
