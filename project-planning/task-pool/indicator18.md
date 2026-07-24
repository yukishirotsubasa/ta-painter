# indicator18 — DMI / ADX 趨向指標

## 說明

新增 `web/src/lib/chart/indicators/dmi.ts`：`id: 'dmi'`、`urlCode: 'dm'`、`placement: 'separate-pane'`。

- 參數：`period`（DI 週期，預設 14）、`adxPeriod`（ADX 平滑週期，預設 14）、`plusColor`（預設 `UP_COLOR`）、`minusColor`（預設 `DOWN_COLOR`）、`adxColor`。
- `compute()`：+DM =（今高 − 昨高）在大於（昨低 − 今低）且為正時取值否則 0，−DM 反之；
  TR 取 `atr.ts` 的 `trueRange(bars).slice(1)`（丟掉沒有前收盤價的首根）；
  ±DI = 100 × `wilderRma(±DM)` / `wilderRma(TR)`；DX = 100 × |+DI − −DI| / (+DI + −DI)；ADX = `wilderRma(DX, adxPeriod)`。
- ADX 比 ±DI 晚 `adxPeriod - 1` 根才成形，`DmiPoint.adx` 在那之前為 `null`，掛載時**不輸出**該時間點的資料點（避免 ADX 線從 0 拉上來）。
- `mount()`：配置一個新 pane，掛 +DI/−DI/ADX 三條線 + ADX 25 參考線。

## 依賴

indicator17

## 驗收方式

1. 單邊上升序列的方向性全落在 +DI、下降序列全落在 −DI，兩者對應的 ADX 皆收斂到 100。
2. 與獨立重寫的實作交叉驗證 ±DI/DX/ADX。
3. ADX 線的資料點數比 ±DI 少 `adxPeriod - 1` 筆。
