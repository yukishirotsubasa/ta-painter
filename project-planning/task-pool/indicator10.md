# indicator10 — separate-pane index 改由 chart.panes() 決定

## 說明

`createPaneIndexAllocator()`（`lib/chart/paneIndexAllocator.ts`）目前只是邏輯上的計數器：`allocate()` 從 `reservedCount` 往上找沒被佔用的 index，`release()` 釋放。它並不知道 lightweight-charts 的實際行為——當一個 pane 內最後一個 series 被移除時，函式庫會自動移除該 pane 並讓後面的 pane index 往前遞補。目前唯一的 separate-pane 指標是 MACD，觸發不到不一致；但新增第二種（例如 RSI）後，同時掛載兩個再移除前面那個，allocator 記錄的 index 就可能與實際 pane 位置對不上，導致後續 `mount()`／`update()` 操作到錯誤的 pane。

改動點：

- allocator 改為查詢 `chart.panes()` 的實際長度來決定新 pane 落點，不再自行維護「已配置 index 集合」；`release()` 隨之變成 no-op 或整個移除。
- `PaneIndexAllocator` 介面（`lib/chart/indicators/types.ts`）維持不變，三個指標的 `mount()` 簽章不動。
- `ChartContainer.tsx` 建構 allocator 的地方改為傳入 `chart`。
- `paneIndexAllocator.test.ts` 改用 fake `chart` 物件（只需 `panes()` 回傳長度可變的陣列），涵蓋「新增 → 移除 → 再新增」與「兩個 separate-pane 同時存在、移除前面那個」兩種情境。

## 依賴

indicator9

## 驗收方式

1. `paneIndexAllocator.test.ts` 以 fake `chart` 涵蓋上述兩種情境並通過。
2. 真實瀏覽器手測：新增 MACD → 移除 → 再新增，pane 位置與高度正常，不出現空白 pane 或錯位。
3. `npm run build` 型別檢查通過。
