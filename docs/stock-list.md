# 股票清單自動更新（已實作）

每週由 GitHub Actions 在 runner 上抓取台股上市／上櫃清單，產出 `web/public/stock-list.json` 供前端使用。因為在 server 端執行，**沒有 CORS 問題、不經 `worker/` proxy**（與執行期的資料層不同，見 [`data-layer.md`](./data-layer.md)、[`proxy.md`](./proxy.md)）。

前端如何載入與搜尋這份清單見 [`symbol-search.md`](./symbol-search.md)。

## 資料來源

| 市場 | 來源 | 格式 | 編碼 |
|---|---|---|---|
| 上市 `TWSE` | `https://isin.twse.com.tw/isin/C_public.jsp?strMode=2` | HTML `<table>` | Big5 系列（實測 header 為 `charset=MS950`）|
| 上櫃 `TPEX` | `https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv` | CSV | UTF-8 含 BOM |

上櫃不走 ISIN `strMode=4`，改用 MOPS CSV——編碼與欄位結構穩定得多。

## 檔案結構

`web/scripts/stock-list/`（TypeScript，零外部依賴，`tsconfig.node.json` 納入型別檢查）

| 檔案 | 職責 |
|---|---|
| `decode.ts` | Big5 系列解碼鏈 |
| `twseIsin.ts` | ISIN HTML 表格解析 |
| `tpexMops.ts` | CSV 狀態機 + MOPS 欄位取值 |
| `stockList.ts` | 型別、去重合併、序列化 |
| `fetchSources.ts` | 下載、重試、有效性 gate |
| `main.ts` | entry：兩來源皆成功才寫檔 |

## 解碼鏈（`decode.ts`）

依序嘗試 `header charset` → `x-windows-950` → `cp950` → `big5` → `gbk`，全部失敗才退到 `latin1`（永不丟錯）。

- 不能直接相信 header：`MS950`／`cp950`／`x-windows-950` 都不是 WHATWG Encoding 的合法 label，`new TextDecoder()` 會丟 `RangeError`。
- `big5` 排在 `gbk` 前面：Big5 位元組在 GBK 下多半也「合法」但會解成錯字。
- **`fatal: true` 的保護有限**：Node 的 Big5/GBK 解碼器會把 0x80–0xFF 的單一位元組映到私用區（如 `0xFF` → `U+F8F8`）而不丟錯，只有殘缺的雙位元組序列才判錯。因此「解碼成功」不等於「編碼猜對了」，真正的防線是下面的有效性 gate。

## TWSE 解析（`twseIsin.ts`）

ISIN 一覽表把所有證券種類放在同一張表，以 `colspan=7` 的分類標題列分段：

```html
<tr><td bgcolor=#FAFAD2 colspan=7 ><B> 股票 <B> </td></tr>
<tr><td bgcolor=#FAFAD2>2330　台積電</td><td>TW0002330008</td>…</tr>
```

- 分類白名單：`股票`、`創新板`、`ETF`（分類名去除所有空白後**精確比對**）
- 不在白名單的分類（`上市認購(售)權證`、`特別股`、`ETN`、`臺灣存託憑證(TDR)`、`受益證券-不動產投資信託`）整段跳過
- 標的列取第一格：全形空白 `U+3000` 轉半形、連續空白壓一個，再以 `^([A-Za-z0-9]+)\s+(.+)$` 切出代號與簡稱
- 表頭列出現在第一個分類之前，此時分類為 `null`，自然被略過

用分類白名單而非代號 regex：新型 ETF 代號規則一直在變（`00631L`、`00710B`、`00980A`），靠分類才不必追著改規則。

## TPEx 解析（`tpexMops.ts`）

公司的「英文通訊地址」等欄位含逗號且被引號包住，不能用 `split(',')`，因此自寫 CSV 狀態機：

- `"` 進入引號模式；引號內 `""` 代表字面 `"`；引號外 `,` 分欄
- `\n`／`\r\n`／孤立 `\r` 皆視為換列；全空列丟棄
- 檔尾仍在引號模式 → 判為檔案毀損並丟錯
- 取「公司代號」與「公司簡稱」欄（用簡稱不用名稱：`茂生農經` ✔ ／ `茂生農經股份有限公司` ✘）；缺任一欄整體失敗，不改猜其他欄位

## 合併與輸出（`stockList.ts`）

依 `code` 去重、先到先贏，呼叫順序為 `mergeStockLists(twse, tpex)`，故上市優先於上櫃。保留來源原始順序，避免每週產生無意義的排序 diff。

輸出 `web/public/stock-list.json` 為一筆一行的 JSON 陣列——仍是合法 JSON，但清單增減時 git diff 只出現異動的那幾行：

```json
[
{"code":"1101","name":"台泥","market":"TWSE"},
{"code":"2330","name":"台積電","market":"TWSE"},
{"code":"6488","name":"環球晶","market":"TPEX"}
]
```

2026-07-23 實跑結果：上市 1314 檔 + 上櫃 891 檔，去重後 **2205 檔**（約 100 KB，無重複代號）。

## 失敗處理（`fetchSources.ts`）

### 有效性 gate

任一來源符合下列任一條件，即判定整體無效——`main.ts` 不寫檔、以非零結束，workflow 不 commit，等於沿用上一版清單：

- HTTP 非 2xx
- payload 為 0 bytes
- **解析後 rows 為空**（HTTP 200 且解析沒報錯，但沒抓到任何標的）
- TPEx CSV 缺必要欄位或引號未閉合

「200 但 rows 為空」必須當失敗——這是網站改版最常見的失效樣態，放行就會把空清單發佈出去。

### 重試

退避 1s → 2s → 4s，共 4 次嘗試（最壞多花 7 秒）。以 `RetryableFetchError` 型別區分暫時性與結構性失效：

| 情況 | 重試 |
|---|---|
| 連線失敗／DNS／逾時（`fetch` 自身丟錯）| ✅ |
| HTTP 408 / 429 / 5xx | ✅ |
| HTTP 200 但 payload 為 0 bytes | ✅ |
| 其他 4xx | ❌ |
| 解析後 rows 為空（來源改版）| ❌ |
| CSV 缺欄位／引號未閉合 | ❌ |

結構性失效不重試，才不會被延遲掩蓋，能立刻讓 workflow 標紅並寄出失敗通知信。

## Workflow

`.github/workflows/update-stock-list.yml`

- 觸發：`schedule` cron `0 20 * * 0`（週日 20:00 UTC＝台北週一 04:00）＋ `workflow_dispatch`
- 步驟：`actions/checkout` → `actions/setup-node`（**Node 24**，直接執行 `.ts` 需要內建型別剝除）→ `node web/scripts/stock-list/main.ts` → 有異動才 `git commit` + `git push`
- 權限 `contents: write`；`concurrency` group `update-stock-list`（不取消進行中的執行）
- 無異動時以 `git status --porcelain` 判斷並跳過，不產生空 commit

### 與 Pages 部署的串接

GITHUB_TOKEN 推出的 commit **不會觸發其他 workflow**（GitHub 的防迴圈限制），所以 `deploy-pages.yml` 的 `push` 觸發條件不會生效。因此 `deploy-pages.yml` 加上 `workflow_call`（含選填的 `ref` input，留空即維持原本行為），由 `update-stock-list.yml` 在有異動時以 `ref: main` 直接呼叫，建置剛推上去的 commit。

2026-07-23 首次 `workflow_dispatch` 時清單無變動，`deploy` job 被 `if: needs.update.outputs.changed == 'true'` 跳過，故此串接尚未實際執行過。但 `deploy / build`、`deploy / deploy` 有出現在該次 run 的 job graph（skipped 狀態），代表 GitHub 已解析並展開被呼叫的 workflow——workflow 路徑、對方的 `on.workflow_call` 宣告與 `ref` input 簽名皆通過驗證（任一項有誤會直接以 workflow 語法錯誤失敗，而非畫出 skipped job）。

### 失敗通知

解析失敗會讓 step 非零結束、run 標記 failed，GitHub 會寄出失敗通知信。兩個前提：

1. `schedule` 觸發的 run，通知只寄給**最後修改該 workflow 檔案的人**；`workflow_dispatch` 則寄給執行者。
2. 個人通知設定需開啟（Settings → Notifications → Actions），建議一併勾選「Only notify for failed workflows」。

## 本機執行

```bash
cd web
npm run update-stock-list   # 需 Node >= 22.6（內建 TS 型別剝除）
npm test                    # parser 單元測試（任何 Node 版本皆可）
```

抓取腳本本身需要 Node 22.6+ 才能直接跑 `.ts`；parser 的單元測試由 vitest 執行，不受本機 Node 版本限制。
