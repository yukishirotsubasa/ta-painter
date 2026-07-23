# share6 — 分享連結的線條還原綁定股票代號

## 說明

修掉「開分享連結 → 第一次查詢失敗 → 不重新整理直接改查別支股票 → 那批線被畫到新股票上」的 bug。成因是 `App.tsx` 的 `pendingLinesRef` 只存線條陣列，沒有記錄「當初要還原的是哪支股票」；查詢失敗時 `ChartContainer` 不 render、pending 一直留著，等下一支股票資料到位就補了上去。副作用是 pending 未清空期間 hash 同步被擋住，網址不會跟著使用者操作更新。

改動點集中在 `App.tsx`：

- `pendingLinesRef` 由 `ShareLine[]` 改為 `{ stockNo: string; lines: ShareLine[] } | null`，初值取自 `restored`（一併記下還原時的股票代號）。
- 依賴 `[bars]` 的還原 effect：`bars.length > 0` 時先比對 `pending.stockNo === stockNo`，相符才逐條 `addLine()`；不符則直接丟棄。
- 兩種情況都要清空 pending，讓 hash 同步的封鎖條件解除。

## 依賴

無。

## 驗收方式

1. 正常路徑不變：帶線條的分享連結在新分頁開啟，線條完整還原且位置正確。
2. 開一個代號不存在（會查詢失敗）的分享連結，接著不重新整理直接改查另一支有效股票，確認**沒有**任何線條被畫出來。
3. 承上，改查後網址 hash 恢復跟著操作更新（不再被 pending 卡住）。
