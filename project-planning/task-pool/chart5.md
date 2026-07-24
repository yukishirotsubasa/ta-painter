# chart5 — 使用還原價開關與除權息標註

## 說明

在 data9 的資料基礎上，提供使用者可切換的「使用還原價」，並在圖表標示除權息／分割日。**採整張圖還原**：開關開啟時 K 線與所有指標同步改用還原價（跳空被抹平、指標貼合 K 棒），指標層零改動——在資料進入 `ChartContainer` 前就把 `bars` 換成還原版本。

- **開關 UI**（新增 `web/src/components/sidebar/AdjustedPriceToggle.tsx`）：受控 checkbox，掛在 `App.tsx` 的 `settings` JSX、`DataSourcePanel` 之後。`dataSource === 'official'` 時 `disabled` 並顯示「僅 Yahoo 源支援還原價」。
- **App 資料流**（`web/src/App.tsx`）：新增 `useAdjusted` state；`canAdjust = dataSource === 'yahoo'`、`effectiveAdjusted = useAdjusted && canAdjust`；`useMemo` 衍生 `displayBars`（`effectiveAdjusted ? toAdjustedBars(bars) : bars`）與 `adjustmentDates`（`detectAdjustmentDates(bars)`，兩種模式都標示），傳給 `<ChartContainer data={displayBars} adjustmentDates={adjustmentDates} />`。
- **除權息垂直線標註**（新增 `web/src/lib/chart/verticalLinePrimitive.ts`）：`ISeriesPrimitive`，仿 `drawing/trendLinePrimitive.ts`，在除權息日時間座標畫一條**貫穿整個 pane 高度**的金色虛線（`ADJUSTMENT_LINE_COLOR`）＋線頂「息」標籤；儲存邏輯時間、`paneView.update()` 內即時轉 pixel。`ChartContainer` mount 時 `attachPrimitive`、`adjustmentDates` 變動時 `setTimes`、卸載 `detachPrimitive`。取代原先貼在 K 棒最高價上方、與指標 marker 相擠的 `createSeriesMarkers` 方案。
- **持久化與分享**（`persistence.ts` / `schema.ts` / `urlState.ts`）：`useAdjusted` 加入 `settingsSchema` 與 `shareStateSchema`（皆 `z.boolean().optional().default(false)`，append-only 向前相容）；精簡字串在尾端新增第 6 欄 `a`（開啟時為 `1`，關閉時省略以維持舊連結長度）。`App` 初值優先序「分享 → 本機 → 預設 false」、`exitPreview` 一併重設、`buildShareUrl` 帶入。

## 依賴

data9

## 驗收方式

1. 開關開啟時 K 線跳空被抹平、MA/MACD 等指標連續；關閉時回原始價。切官方源開關 disabled 並顯示提示。
2. 除權息日出現貫穿全高的垂直虛線＋「息」標籤；縮放／pan 後不跑位；範圍外日期不畫。
3. `useAdjusted` 存入 `settings:v1`；分享連結 round-trip（開啟／關閉皆可還原），舊連結無第 6 欄→預設 false。
4. `VerticalLinePrimitive` 單元測試：每日期一條全高線、頂部標籤、範圍外略過、未 attach／detach 後不畫、setTimes 觸發 requestUpdate。
5. typecheck／lint／test 全綠。
