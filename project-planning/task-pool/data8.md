# data8 — 資料源失效的使用端提示

## 說明

上游（TWSE／TPEx／Yahoo）的反爬蟲規則不受控且隨時可能變動，失效時目前只會顯示原始錯誤訊息，使用者無從判斷是自己輸入錯還是資料源掛了。**決策方向為使用端即時提示而非週期性健康檢查**（原 `ci3` 的 cron 方案已取消）：上游出問題會立即影響使用者，應在使用端當下告知，而非靠排程事後發現。

改動點：

- 資料層新增錯誤分類。建議以純函式 `classifyDataError(err)` 實作（好測，且不必動三個 provider 既有的 `throw new Error(...)`），或改用帶 `kind` 的 `DataSourceError`。分類：
  - `upstream-blocked`：HTTP 403 / 429 / 5xx、`fetch` 網路錯誤、proxy 無回應。
  - `no-data`：請求成功但查無資料（代號不存在、區間無交易日；如 TWSE/TPEx 回 `stat` 非 OK 的查無資料情形）。
  - `unknown`：其餘。
- `App.tsx` 的查詢失敗分支：`error` 狀態改帶分類結果，**只在 `upstream-blocked` 時**於原始錯誤訊息下方追加一段固定文案，說明資料源可能已失效、請聯絡製作者。
- **只顯示文字，不附 GitHub Issues 連結或 email**；原始錯誤訊息（如 `TPEx 請求失敗：HTTP 403`）保留顯示，方便回報時附上。

不做：GitHub Actions cron 健康檢查、自動開 issue、任何告警通知。

## 依賴

無。

## 驗收方式

1. `classifyDataError()` 的分類規則有單元測試涵蓋三種 kind 的代表性輸入。
2. stub `fetch` 回 403 或 429，畫面顯示原始錯誤訊息**加上**「請聯絡製作者」提示。
3. 輸入不存在的代號（查無資料），畫面只顯示查無資料的訊息，**不**出現聯絡製作者提示。
