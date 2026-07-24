# indicator13 — 指標新增 UI 改為下拉選單

## 說明

`IndicatorPanel.tsx` 的 `.indicator-panel-add` 目前把 `listIndicators()` 的每個定義平鋪成一顆「+ 指標名」按鈕。指標從 3 個增加到 15 個後，這一列在側邊欄寬度（`--sidebar-width: 260px`）下會變成一整面按鈕牆。

改為 `<select>`（選項仍完全來自 `listIndicators()`，不寫死清單）+ 一顆「+ 新增」按鈕，選單以 `useState` 記住目前選取的 `definitionId`。`IndicatorPanel.css` 的 `.indicator-panel-add` 對應調整（select 佔滿剩餘寬度、按鈕不縮）。

## 依賴

-

## 驗收方式

1. 側邊欄指標區塊只有一個下拉選單與一顆新增鈕，選單列出全部已註冊指標。
2. 選任一指標後按新增，該指標正確加入清單並掛上圖表。
3. 新增指標檔案後不需要改 `IndicatorPanel.tsx`，選單自動出現新項目。
