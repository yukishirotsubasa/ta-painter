# data3 — 逐月請求佇列、節流與進度回報

## 說明

在 `web/src/lib/data/throttle.ts` 實作序列化請求佇列（`RequestQueue`），依查詢區間算出需要的月份清單，逐月呼叫 `TwseProvider` 的單月查詢，每次請求間隔 300–500ms 節流，並透過 `onProgress({loaded, total, message})` callback 回報進度。支援 `AbortSignal` 取消。

## 依賴

data2

## 驗收方式

1. 查詢一個約半年區間（6 個月），UI 顯示的進度條/文字正確從 0 跑到完成。
2. 檢查回傳資料涵蓋的月份無缺漏、無重複。
3. 查詢中途觸發取消（`AbortSignal`），確認請求佇列停止且不拋未處理例外。
