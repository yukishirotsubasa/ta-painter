# indicator8 — 指標顏色可調與共用色票

## 說明

布林通道（`bollinger.ts`）三條線、MACD（`macd.ts`）DIF/DEA/histogram 漲跌色、量能柱（`ChartContainer.tsx`）漲跌色改為可調（`color` 參數）或讀取共用色票。抽出 `web/src/lib/chart/colors.ts` 集中 `UP_COLOR`/`DOWN_COLOR` 等常數，讓 `ChartContainer.tsx` 與 `macd.ts` 共用同一份（消解「配色寫死+重複定義」技術債）。

## 依賴

indicator6

## 驗收方式

1. 布林/MACD 線色可透過參數面板調整並即時更新。
2. `colors.ts` 建立後 `ChartContainer.tsx` 與 `macd.ts` 不再各自重複定義相同色值。
3. 既有預設外觀不變（未調整時沿用原色）。
