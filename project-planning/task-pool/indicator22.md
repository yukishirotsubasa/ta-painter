# indicator22 — SAR 拋物線轉向指標

## 說明

新增 `web/src/lib/chart/indicators/sar.ts`：`id: 'sar'`、`urlCode: 'sr'`、`placement: 'overlay'`。

- 參數：`step`（加速因子，預設 0.02）、`maxStep`（加速上限，預設 0.2）、`longColor`（預設 `UP_COLOR`）、`shortColor`（預設 `DOWN_COLOR`）。
- `compute()` 為 Wilder 原始演算法：起始方向由前兩根收盤價決定；每根先 `SAR += AF × (EP − SAR)`，再夾住不得侵入前兩根的價格區間，最後檢查是否被當根價格穿越而反轉（反轉時 SAR 設為原本的 EP、EP 設為當根極值、AF 重置為 `step`）。未反轉且創新極值時 EP 更新、AF 加一個 `step`（上限 `maxStep`）。至少需要 3 根 K 棒，輸出從第 3 根開始。
- `mount()`：主圖 pane 0 掛一條 `LineSeries`，但 `{ lineVisible: false, pointMarkersVisible: true }`，用 `LineData.color` 逐點上色（多頭段綠、空頭段紅），呈現傳統的拋物線點列。

## 依賴

indicator12

## 驗收方式

1. 單邊上升時 SAR 恆為多頭且不高於當根最低價；單邊下跌時恆為空頭且不低於當根最高價。
2. 先漲後暴跌的序列會由多翻空。
3. `step` 較大時 SAR 追得更近（值更高）；少於 3 根 K 棒回傳空陣列。
