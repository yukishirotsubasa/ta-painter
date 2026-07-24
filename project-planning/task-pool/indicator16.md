# indicator16 — RSI 相對強弱指標

## 說明

新增 `web/src/lib/chart/indicators/rsi.ts`：`id: 'rsi'`、`urlCode: 'rs'`、`placement: 'separate-pane'`。

- 參數：`period`（預設 14）、`color`。
- `compute()`：對相鄰收盤價差拆成漲幅/跌幅兩序列，各做一次 `wilderRma()`，RSI = 100 − 100/(1 + 平均漲幅/平均跌幅)；平均跌幅為 0 時直接輸出 100。差值序列比 bars 少一筆，故第一個值落在 `bars[period]`（需 period + 1 根）。
- `mount()`：配置一個新 pane，加 30/70 參考線。

## 依賴

indicator12

## 驗收方式

1. 只漲的序列輸出 100、只跌輸出 0，交替序列在 0–100 間震盪且橫跨 50。
2. 與獨立重寫的 Wilder RSI 交叉驗證非平凡序列。
3. 需要 period + 1 根才有第一個點。
