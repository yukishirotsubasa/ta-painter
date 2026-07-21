# indicator3 — 布林通道指標

## 說明

實作 `bollinger.ts`：`compute()` 計算 SMA(n) ± k×標準差（上軌/中軌/下軌），`mount()` 用三個 `LineSeries` 疊加在主圖 pane（overlay）。`paramsSchema` 提供週期與標準差倍數參數。

## 依賴

indicator1

## 驗收方式

1. 啟用布林通道指標，主圖正確顯示三條線（上中下軌）。
2. 抽查數值與手動計算或其他工具比對一致。
3. 調整參數（週期/倍數）後三條線正確即時更新。
