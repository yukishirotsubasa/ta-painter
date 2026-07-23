# symbol1 — 每週股票清單 GitHub Actions

## 說明

新增 `.github/workflows/update-stock-list.yml`，每週排程（`schedule` cron，另附 `workflow_dispatch` 手動觸發）。在 GitHub runner（server 端，**無 CORS、不需 proxy**）抓取 TWSE 上市與 TPEx 上櫃股票清單（代號、名稱、市場別）：

- TWSE 上市：ISIN `https://isin.twse.com.tw/isin/C_public.jsp?strMode=2`（HTML 表格解析，Big5 系列編碼）。以 `colspan=7` 的分類標題列分段，只取 `股票`／`創新板`／`ETF` 三類；用分類白名單而非代號 regex，新型 ETF 代號才不必追著改規則。
- TPEx 上櫃：MOPS 上櫃公司基本資料 CSV `https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv`（UTF-8 含 BOM），取「公司代號」與「公司簡稱」欄。**不走 ISIN `strMode=4`**：MOPS CSV 的編碼與欄位結構穩定得多。

抓取與解析程式以 TypeScript 寫在 `web/scripts/stock-list/`（沿用 `web` 工具鏈，parser 由 vitest 覆蓋、`tsc -b` 檢查型別），runner 上以 Node 24 直接執行 `.ts`（內建型別剝除）。

合併輸出為 `web/public/stock-list.json`（格式 `[{code, name, market}]`，`market` 為 `TWSE`/`TPEX`，依 `code` 去重、上市優先）。若內容有變則 commit 回 repo；因 GITHUB_TOKEN 推的 commit 不會觸發其他 workflow，改由本 workflow 直接呼叫 `deploy-pages.yml`（已加 `workflow_call` 與 `ref` input）發佈 Pages。

## 依賴

無。

## 驗收方式

1. 手動 `workflow_dispatch` 執行成功，產出/更新 `web/public/stock-list.json`，內含上市與上櫃代號、名稱、市場別。
2. 抽查數檔知名代號（上市 2330、任一上櫃代號）名稱與市場別正確。
3. 排程設定為每週執行；清單無變動時不產生空 commit。

## 實作結果（2026-07-23）

已對真實線上來源實跑，產出 `web/public/stock-list.json`：**上市 1314 檔 + 上櫃 891 檔，去重後 2205 檔**（約 100 KB）。

- 抽查納入：`2330 台積電`(TWSE)、`2254 巨鎧精密-創`(TWSE)、`0050`/`00631L`/`00710B`/`00980A`(TWSE)、`6488 環球晶`(TPEX)、`7584 樂意`(TPEX)、`1240 茂生農經`(TPEX，取簡稱非全名)
- 抽查排除：權證 `030012`、特別股 `2881A`、ETN `020000`、TDR `910322`、REIT `01001T` 皆不在清單
- 有效性 gate：任一來源 HTTP 非 2xx／payload 為空／解析後 rows 為空／CSV 缺欄位或未閉合引號 → 整體失敗且不寫檔，沿用上一版清單
- 重試：連線失敗、408/429/5xx、空 payload 退避重試 3 次（1s/2s/4s）；4xx 與解析失敗不重試，讓「來源改版」這種結構性失效立刻讓 workflow 標紅寄出通知信
- 單元測試 32 例（`web/scripts/stock-list/*.test.ts`），fixture 取自實際下載的 ISIN HTML 與 MOPS CSV 片段

行為細節見 [`docs/stock-list.md`](../../docs/stock-list.md)。

### GitHub Actions 實跑驗證（2026-07-23）

手動 `workflow_dispatch` 執行成功，輸出 `清單無變動（共 2205 檔），不寫檔。`——驗收項目 1、3 達成（無變動時走 `git status --porcelain` 的 early exit，不產生空 commit）。同時確認：

- runner（Linux／Node 24 原生執行 `.ts`）產出與本機（Windows／Node 20 轉譯後）**完全相同的 2205 檔**，解析結果跨平台、跨 Node 版本一致
- Node 24 內建型別剝除可直接跑 `.ts`，不需 `npm ci`、零外部依賴
- GitHub runner 出站 IP 未被 TWSE ISIN／MOPS 阻擋（對照 `worker/` 因 TPEx 封鎖 Cloudflare Workers IP range 而改用 Deno Deploy 的經驗，這點並非理所當然）

**尚未實跑到的路徑**：因 `changed=false`，`deploy` job 被 `if` 條件跳過，`update-stock-list` → `deploy-pages.yml` 的 `workflow_call` 串接尚未實際執行。不過該次 run 的 job graph 有畫出 `deploy / build`、`deploy / deploy` 兩個 skipped job，代表串接的**接線本身已通過 GitHub 驗證**（workflow 路徑、`on.workflow_call` 宣告、`ref` input 簽名皆正確），剩下的只是實際跑一次，待下次清單變動時自然發生。

注意：透過 `workflow_call` 呼叫的可重用 workflow 是以巢狀 job 掛在呼叫方的 run 底下，**不會在 Deploy Pages 自己的執行歷史裡產生獨立紀錄**，屆時要在 Update Stock List 那次 run 內部查看。
