# chart4 — 整站固定 dark 主題

## 說明

移除 light 主題分支，讓頁面 UI、圖表 canvas、分享圖片三者配色一致，消解「圖表配色寫死不跟隨主題」技術債——**決策方向為固定 dark 而非跟隨系統**：淺色系統下截圖會是白底配深色格線與深色文字（`screenshot.ts` 的 `resolvePageBackgroundColor()` 讀 `--bg` 已跟隨主題，圖表內部卻寫死深色），為避免分享時因各人系統主題不同造成難以瀏覽，統一固定深色。

改動點：

- `web/src/index.css`：把 `@media (prefers-color-scheme: dark)` 區塊的變數值直接寫進 `:root`，刪除該 media query；`color-scheme: light dark` 改為 `dark`。順帶清掉 Vite 樣板殘留、專案內無任何元素使用的 `#social .button-icon` 規則。
- `web/src/lib/chart/colors.ts`：新增 `CHART_TEXT_COLOR` / `CHART_GRID_COLOR`，取值對齊 `--text` / `--border` 的深色值（`#9ca3af` / `#2e303a`）。
- `web/src/components/chart/ChartContainer.tsx`：`createChart` 的 `layout.textColor` 與 `grid.vertLines/horzLines.color` 改引用上述常數，不再寫死 hex。
- `web/index.html`：加 `<meta name="theme-color">` 對齊 `--bg`，讓行動版瀏覽器 UI 一併深色。

不做：主題切換 UI、`matchMedia` 監聽、`colors.ts` 輸出兩套色票。`screenshot.ts` 維持現狀（`--bg` 固定深色後其結果自然恆定）。

## 依賴

無。

## 驗收方式

1. 將作業系統切為淺色主題並重新載入，頁面與圖表（背景、格線、座標文字）仍為深色，無白底元素。
2. 同一狀態下按「複製圖片」，貼到其他軟體確認為深底，與畫面一致。
3. `ChartContainer.tsx` 內不再出現寫死的顏色 hex，色值皆來自 `colors.ts`。
