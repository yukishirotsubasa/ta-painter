# symbol2 — 代號輸入框搜尋建議

## 說明

`ChartToolbar`（`web/src/components/chart/ChartToolbar.tsx`）載入 `stock-list.json`，將陽春輸入框升級為支援搜尋建議：輸入**代號或名稱**做模糊比對，顯示下拉建議清單，支援鍵盤上下選取與 Enter 帶入。選取後帶入代號並記住其市場別（供 sidebar2 官方源自動路由）。同時修正輸入框不跟隨外部 `stockNo` 同步的技術債（加 `useEffect(() => setDraft(stockNo), [stockNo])`）。

## 依賴

symbol1

## 驗收方式

1. 輸入代號片段（如 `233`）出現含 2330 的建議；輸入名稱片段（如「台積」）也能搜到 2330。
2. 鍵盤上下鍵可移動選取、Enter 帶入並換圖。
3. 外部改變 `stockNo`（如未來分享還原）時輸入框顯示同步更新。
