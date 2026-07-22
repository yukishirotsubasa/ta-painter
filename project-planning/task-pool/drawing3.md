# drawing3 — 切換股票自動清除畫線

## 說明

在股票代號變更的 state effect 中呼叫 `DrawingController.clearAll()`，遍歷目前線條逐一 `pane.detachPrimitive(line)` 並清空陣列。畫線資料純記憶體狀態，不持久化。

## 依賴

drawing2, chart3

## 驗收方式（僅桌面；行動觸控驗證集中在 [drawing5](drawing5.md)）

1. 畫一條或多條線後切換到另一支股票代號，畫面上所有線條立即消失。
2. 切換回原本股票代號，確認線條不會「復原」（證明真的是清空而非隱藏）。
