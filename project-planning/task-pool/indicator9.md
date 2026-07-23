# indicator9 — 指標共用常數單一來源（線色 + 保留 pane index）

## 說明

消解 `ma.ts` 對兩份知識的重複宣告，純重構、行為完全不變：

1. **保留 pane 佈局**：`ma.ts` 為了讓 `source=volume` 的 MA 掛到量能 pane，硬編了 `PRICE_PANE_INDEX = 0` / `VOLUME_PANE_INDEX = 1`，這份「pane 0=K 線、pane 1=量能」的知識實際由 `ChartContainer.tsx` 擁有（`RESERVED_PANE_COUNT` 與建立 series 的順序決定）。新增 `web/src/lib/chart/panes.ts` 曝光 `PRICE_PANE_INDEX` / `VOLUME_PANE_INDEX` / `RESERVED_PANE_COUNT`（含註解說明順序來源），`ChartContainer.tsx` 與 `ma.ts` 共同引用，刪除各自的本地宣告。
2. **預設線色**：`ma.ts` 仍留著自己的 `DEFAULT_COLOR = '#2196f3'`，與 `colors.ts` 的 `DEFAULT_LINE_COLOR` 同值。改成 `import { DEFAULT_LINE_COLOR } from '../colors'`，`mount`／`update`／參數 schema 預設值三處引用點一併換掉，讓 MA 與布林／MACD 共用單一預設線色來源。

## 依賴

無。

## 驗收方式

1. `ma.ts` 內不再有 `DEFAULT_COLOR`、`PRICE_PANE_INDEX`、`VOLUME_PANE_INDEX` 的本地宣告，全部改為 import。
2. `ChartContainer.tsx` 的 `RESERVED_PANE_COUNT` 與建立 candlestick/volume series 時的 pane index 皆來自 `panes.ts`。
3. `npm test` 全數通過；實際操作 MA 指標（含 `source=volume`）外觀與掛載位置與改動前一致。
