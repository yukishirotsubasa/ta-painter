# symbol2 — 代號輸入框搜尋建議

## 說明

`ChartToolbar`（`web/src/components/chart/ChartToolbar.tsx`）載入 `stock-list.json`，將陽春輸入框升級為支援搜尋建議：輸入**代號或名稱**做模糊比對，顯示下拉建議清單，支援鍵盤上下選取與 Enter 帶入。選取後帶入代號並記住其市場別（供 sidebar2 官方源自動路由）。同時修正輸入框不跟隨外部 `stockNo` 同步的技術債（加 `useEffect(() => setDraft(stockNo), [stockNo])`）。

## 依賴

symbol1

## 驗收方式

1. 輸入代號片段（如 `233`）出現含 2330 的建議；輸入名稱片段（如「台積」）也能搜到 2330。
2. 鍵盤上下鍵可移動選取、Enter 帶入並換圖。
3. 外部改變 `stockNo`（如未來分享還原）時輸入框顯示同步更新。
4. （追加需求）只輸入中文名稱時，取「名稱開頭完全符合」的第一筆當目標；沒有全符合就不刷新資料，不得把中文字串當 symbol 送去查詢。

## 實作結果（2026-07-23）

新增 `web/src/lib/stock/`：`types.ts`（`Market`/`StockListEntry`/`SymbolSelection`）、`stockList.ts`（模組層快取的 `loadStockList()`，逐筆驗證形狀、失敗不快取可重試）、`search.ts`（`searchStocks()`/`findByCode()`）。`ChartToolbar` 改為 combobox（`role="combobox"` + `role="listbox"`，`aria-activedescendant` 標示選取項），最多 8 筆建議，顯示代號／名稱／上市櫃。

- **排序規則**：代號開頭 > 名稱開頭 > 代號包含 > 名稱包含，同分保持清單原始順序（代號遞增）。**不做跳字模糊比對**——2205 檔的清單下跳字會讓「台積」帶出一堆雜訊，反而更難選中。
- **市場別解析放在 `App.tsx` 而非元件內**：`onSubmit` 只回傳代號，App 用 `findByCode()` 回頭查清單補 `market` 並正規化代號大小寫（`00631l` → `00631L`）。這樣下拉選取、手動輸入、預設 2330、未來 share2 的 URL 還原全走同一條解析路徑，只有一處要維護。
- **技術債修正**：加上 `useEffect(() => setDraft(stockNo), [stockNo])`，`stockNo` 由外部改變時輸入框同步（上述代號正規化即為實例，也讓 share2 不必再處理）。
- 鍵盤：↑/↓ 移動（含環繞、可回到「未選取」狀態）、Enter 帶入並換圖、Esc 關閉；中文輸入法選字中的 Enter 以 `isComposing` 擋掉隱式送出。滑鼠以 `onMouseDown` + `preventDefault` 選取，避免 blur 先關閉下拉造成點擊落空。
- **送出前的代號解析（`resolveSubmitCode()`）**：清單內代號 > 看起來像代號（純英數）就原樣放行（清單每週才更新，新代號可能還沒進清單）> 名稱開頭完全符合的第一筆。中文名稱對不到任何股票時回 `null`，`ChartToolbar` 擋下不呼叫 `onSubmit`，改在工具列顯示「查無「XXX」，請改用代號或從建議清單選取」（`role="alert"`），避免把「積電」這種字串當 symbol 送進資料源、空等三秒才得到「沒有符合條件的資料」。
- 單元測試 23 例（`search.test.ts` / `stockList.test.ts`）；瀏覽器實測：`233` → 2330/2337/2233…、`台積` → 2330、↓↓↓↓ + Enter 選到 6488 環球晶並換圖、輸入 `00631l` 送出後輸入框變 `00631L` 且圖表載入成功、下拉以 `z-index: 20` 蓋在圖表畫布上方（`elementFromPoint` 驗證）、送出「台積」→ 輸入框變 2330 並換圖、送出「積電」→ 顯示提示且完全不發查詢。

已知限制：選 6488 這類上櫃股會查詢失敗（資料源目前寫死 `TwseProvider`），要等 sidebar2 依 `market` 自動路由才會通。
