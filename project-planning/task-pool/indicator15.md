# indicator15 — KD 隨機指標

## 說明

新增 `web/src/lib/chart/indicators/kd.ts`：`id: 'kd'`、`urlCode: 'kd'`、`placement: 'separate-pane'`。

- 參數：`rsvPeriod`（預設 9）、`kPeriod`（預設 3）、`dPeriod`（預設 3）、`kColor`、`dColor`。
- `compute()`：RSV =（收盤 − n 日最低）/（n 日最高 − n 日最低）× 100（用 `rollingMax`/`rollingMin`）；
  K = 前一 K ×(1 − 1/kPeriod) + RSV/kPeriod，D 對 K 再平滑一次，K/D 初值皆為台股慣用的 50。
  視窗高低相同（無波動）時 RSV 取中性值 50 避免除以 0。
- `mount()`：配置一個新 pane，掛 K/D 兩條線，並用 `createReferenceLines()` 加 20/80 超買超賣線。

## 依賴

indicator12

## 驗收方式

1. 手算 RSV/K/D 與實作一致（含 50 初值），K/D 恆落在 0–100。
2. 無波動視窗回中性 50，資料不足 rsvPeriod 天不輸出。
3. `dispose()` 移除兩條線與參考線並歸還 pane index。
