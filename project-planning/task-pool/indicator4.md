# indicator4 — MACD 指標（Separate Pane）

## 說明

實作 `macd.ts`：`compute()` 計算 EMA(fast)、EMA(slow)、DIF、DEA(signal)、histogram(DIF-DEA)，`mount()` 用 `placement: 'separate-pane'`，透過 `paneIndexAllocator` 取得新 pane index，放兩條 `LineSeries`（DIF/DEA）+ 一個 `HistogramSeries`（正負值上色）。移除指標時需正確歸還 pane index 並確認 pane 消失。

## 依賴

indicator1

## 驗收方式

1. 啟用 MACD，圖表下方出現獨立子 pane，正確顯示 DIF/DEA 線與 histogram。
2. 抽查數值與其他工具比對一致。
3. 移除 MACD 指標後，該 pane 自動消失（驗證 `chart.removeSeries` 後 pane 因無 series 而自動消失的行為）。
4. 移除後再新增另一個 separate-pane 指標，確認 pane index 分配正確不衝突。
