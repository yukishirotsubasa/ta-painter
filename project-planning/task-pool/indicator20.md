# indicator20 — CCI 順勢指標與威廉指標 %R

## 說明

兩個結構相近的震盪指標，各一個檔案。

`cci.ts`：`id: 'cci'`、`urlCode: 'cc'`、`placement: 'separate-pane'`。
- 參數：`period`（預設 20）、`color`。
- 典型價 TP =（高 + 低 + 收）/ 3；CCI =（TP − SMA(TP)）/（0.015 × 視窗內 |TP − SMA| 的平均）。
  注意分母是**平均絕對偏差**而非標準差；偏差為 0 時輸出 0。參考線 ±100。

`williams.ts`：`id: 'williams'`、`urlCode: 'wr'`、`placement: 'separate-pane'`。
- 參數：`period`（預設 14）、`color`。
- %R =（n 日最高 − 收盤）/（n 日最高 − n 日最低）× −100，值域 −100 ~ 0；視窗無波動時取中點 −50。參考線 −20/−80。

## 依賴

indicator12

## 驗收方式

1. CCI 手算值（TP 視窗 [10,12,14] → 100）與實作一致，且確實用 TP 而非單看收盤價。
2. %R 在收盤價位於視窗高/低點時分別為 0 / −100，且恆落在 −100 ~ 0。
3. %R 與 KD 的 RSV 互為鏡像（`%R = RSV − 100`，以 `kPeriod=1` 的 K 值比對）。
