# indicator11 — 指標 reconcile 加變更偵測

## 說明

`ChartContainer.tsx` 的指標 reconcile `useEffect`（依賴 `[data, indicators]`）目前對所有已掛載的指標實例無條件呼叫 `handle.update(data, instance.params)`，不論該實例的 `params` 是否真的變動。這是當初刻意的簡化（避免對 `IndicatorInstance` 做深層比較），在指標 `compute()` 都是輕量純函式時成本可忽略；但調整單一指標參數會連帶重算並重繪其他未變動的指標，指標數量變多或未來加入較重的 `compute()` 時會造成不必要的開銷與圖表閃爍。

改動點集中在該 reconcile effect：

- `mountedIndicatorsRef` 的值一併記下上次套用的 `params` 與 `data` 參考。
- 只在 `data` 參考改變、或該實例 `params` 淺層 diff 有異時才呼叫 `update()`。
- `params` 是 `Record<string, number | string>`（indicator6 後為扁平結構），淺層比較即足夠，不需深層 diff。

## 依賴

indicator9

## 驗收方式

1. 掛載兩個以上指標，調整其中一個的參數，只有該指標重繪（可用其 `compute()` 的側錄或 `update()` 呼叫次數驗證）。
2. 切換股票／資料源導致 `data` 更新時，所有指標仍正確重算。
3. `npm test` 全數通過，既有指標行為不變。
