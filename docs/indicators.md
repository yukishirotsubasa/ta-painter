# 技術指標架構（`web/src/lib/chart/indicators/`、`components/chart/IndicatorPanel.tsx`）

> 本文件記錄**已實作**的指標可擴充架構與目前唯一已完成的指標（MA）。布林通道／MACD 尚未實作，規劃見 `project-planning/task-pool/indicator3.md`、`indicator4.md`；整體規劃見 `project-planning/design.md`。

## 指標定義介面（`types.ts`）

```ts
interface IndicatorParamSchema {
  key: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

type IndicatorParamValues = Record<string, number>;

interface IndicatorInstance {
  id: string;           // 使用者新增的單一指標實例（同一 definition 可有多個實例，如 MA5+MA20）
  definitionId: string; // 對應 IndicatorDefinition.id
  params: IndicatorParamValues;
}

interface PaneIndexAllocator {
  allocate(): number;
  release(paneIndex: number): void;
}

interface IndicatorMountHandle {
  update(bars: OhlcvBar[], params: IndicatorParamValues): void;
  dispose(): void;
}

interface IndicatorDefinition<TValue = unknown> {
  readonly id: string;
  readonly label: string;
  readonly placement: 'overlay' | 'separate-pane';
  readonly paramsSchema: IndicatorParamSchema[];
  compute(bars: OhlcvBar[], params: IndicatorParamValues): TValue;
  mount(chart: IChartApi, paneIndexAllocator: PaneIndexAllocator, bars: OhlcvBar[], params: IndicatorParamValues): IndicatorMountHandle;
}
```

- `compute()` 必須是純函式：相同 `bars`/`params` 輸入永遠回傳相同輸出，不得讀寫外部狀態、不得修改輸入的 `bars` 陣列。實際數值計算與正確性驗證都靠這個函式的單元測試（不需要真的建立 chart）。
- `mount()` 才是有副作用的部分：把 `compute()` 的結果實際掛到 lightweight-charts 的 series/pane 上，回傳的 `IndicatorMountHandle` 讓呼叫端之後可以 `update()`（參數變動時重算+`series.setData()`）或 `dispose()`（移除 series，separate-pane 指標需在自己的 `dispose()` 內呼叫 `paneIndexAllocator.release()` 歸還 pane index——目前唯一已實作的指標 MA 是 overlay，不使用 `paneIndexAllocator`，尚未有已實作的 separate-pane 指標驗證過完整的配置/歸還流程）。

## Registry（`registry.ts`）

```ts
registerIndicator(definition): void
getIndicator(id): IndicatorDefinition | undefined
listIndicators(): IndicatorDefinition[]
clearIndicators(): void  // 僅測試用，清空整個 registry
```

跟 `lib/data/providers/providerRegistry.ts` 同一種寫法：`Map<string, IndicatorDefinition>`，指標模組（如 `ma.ts`）在檔案最後以 side-effect 呼叫 `registerIndicator()` 自行完成註冊。`IndicatorPanel.tsx` 完全從 `listIndicators()` 動態列出可新增的指標種類，**不在元件內寫死指標清單**——新增指標檔案並註冊後，UI 會自動出現，不需要改 `IndicatorPanel.tsx`。

## `PaneIndexAllocator` 實作（`lib/chart/paneIndexAllocator.ts`）

`createPaneIndexAllocator(reservedCount)` 回傳的實例從 `reservedCount` 開始配置遞增的 pane index，`release(index)` 釋放後該 index 可被下一次 `allocate()` 重用（找最小的未配置 index）。`ChartContainer.tsx` 用 `RESERVED_PANE_COUNT = 2`（pane 0 = K 線、pane 1 = 量能）建立唯一一個 allocator 實例，供未來 separate-pane 指標共用。

**已知限制**：這個 allocator 只是邏輯上的計數器，並未對應 lightweight-charts 實際的 pane 陣列行為——當一個 pane 內最後一個 series 被移除時，lightweight-charts 會自動移除該 pane 並讓後面的 pane index 往前遞補。目前沒有已實作的 separate-pane 指標（MACD／[indicator4](../project-planning/task-pool/indicator4.md) 尚未做），所以這個潛在的索引錯位問題尚未被實際驗證或處理，留給 indicator4 落地時處理。

## MA 指標（`ma.ts`）

- `id: 'ma'`，`placement: 'overlay'`，`paramsSchema` 只有一個 `period` 參數（預設 20，範圍 1–240）。
- `compute(bars, params)`：對 `close` 算簡單移動平均。實作方式是對每個索引 `i >= period - 1` 取 `bars[i-period+1 ..= i]` 這個視窗算平均——**資料不足 period 天的時間點不會輸出資料點**（不是輸出 `NaN`），所以回傳陣列長度會比 `bars` 短。
- `mount()`：`chart.addSeries(LineSeries, {}, 0)` 疊加在主圖 pane 0，`setData()` 直接放入 `compute()` 的結果。`update()`/`dispose()` 分別對應 `series.setData()` 重算與 `chart.removeSeries()`。
- 數值正確性已用真實 TWSE 公開數字交叉驗證過（見 `ma.test.ts`，取自 `twseProvider.test.ts` 的 2330 真實收盤價算 MA5 比對）。

## 指標清單 UI（`components/chart/IndicatorPanel.tsx` + `App.tsx`）

`IndicatorPanel` 是純展示元件：

- Props：`instances`（目前所有 `IndicatorInstance`）、`onAdd(definitionId)`、`onRemove(instanceId)`、`onParamsChange(instanceId, params)`。
- 上方列出 `listIndicators()` 回傳的每個指標定義的「+ 新增」按鈕；下方列出每個 `instance`，依 `definition.paramsSchema` 動態產生數字輸入框，並有一個移除按鈕。

實際狀態管理與 chart 掛載邏輯在別處：

- `App.tsx` 用 `useState<IndicatorInstance[]>` 管理實例陣列，`addIndicator()`（用 `crypto.randomUUID()` 產生實例 id、依 `paramsSchema` 的 `default` 值初始化參數）、`removeIndicator()`、`updateIndicatorParams()` 三個函式對應 `IndicatorPanel` 的三個 callback，並把 `indicators` 陣列與 `bars` 一起傳給 `<ChartContainer>`。
- `ChartContainer.tsx` 新增了 `indicators` prop，內部用一個 `useEffect`（依賴 `[data, indicators]`）做 reconcile：比對目前 `indicators` 的 id 集合與已掛載（`mountedIndicatorsRef` 這個 `Map<instanceId, IndicatorMountHandle>`）的差異——不在集合中的呼叫 `dispose()` 並從 map 移除；在集合中的若已掛載就呼叫 `update(data, instance.params)`，未掛載則呼叫 `definition.mount()` 並存入 map。**這個 effect 對所有仍掛載的實例都無條件呼叫 `update()`，沒有做「這個實例的 params 到底有沒有變」的診斷**（已記錄在 `project-planning/technical-debt.md`）。
- 元件卸載（chart 被移除）時，所有已掛載指標的 `dispose()` 都會被呼叫，確保不留下孤兒 series。

## 手動驗證紀錄

以下項目已在真實瀏覽器（`npm run dev`）手動點擊驗證過（sandbox 環境擋外部網路，無法真的抓到 TWSE 資料，因此圖表上沒有 K 線可看、也就看不到 MA 線疊加的視覺效果，但下列互動邏輯本身是對著真實 `IChartApi` 執行的）：

- 新增兩個 MA 實例，各自獨立顯示週期輸入框（預設 20）。
- 把其中一個實例的週期改成 5，另一個維持 20 不受影響。
- 移除其中一個實例，只有該實例消失，另一個維持正常。
- 全程瀏覽器 console 無錯誤。

## 已知限制 / 尚未實作

- 布林通道（[indicator3](../project-planning/task-pool/indicator3.md)）、MACD（[indicator4](../project-planning/task-pool/indicator4.md)）尚未實作，因此「MA、布林通道、MACD 三種指標同時啟用且互不影響」（[indicator5](../project-planning/task-pool/indicator5.md) 驗收方式第 1 點）尚未能驗證。
- 因為 sandbox 網路限制，MA 疊加到圖表上的**視覺效果**未經肉眼確認，只驗證過互動邏輯（見上）與 `compute()` 數值正確性。
