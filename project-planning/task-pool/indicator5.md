# indicator5 — 指標清單 UI（多實例管理）

## 說明

在 `IndicatorPanel.tsx` 從 registry 動態列舉可用指標，讓使用者新增/移除指標實例（同一種指標可有多個實例，如多條不同週期的 MA）。每個實例的參數表單依 `paramsSchema` 自動產生。

## 依賴

indicator2, indicator3, indicator4

## 驗收方式

1. 可同時啟用 MA、布林通道、MACD 三種指標，畫面正確顯示且互不影響。
2. 新增第二個 MA 實例（不同週期），與第一個 MA 共存不衝突。
3. 移除單一指標實例，只影響該實例，其餘指標維持正常顯示。
