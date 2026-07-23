# 技術指標架構（`web/src/lib/chart/indicators/`、`components/chart/IndicatorPanel.tsx`）

> 本文件記錄**已實作**的指標可擴充架構與目前已完成的指標（MA、布林通道、MACD）。整體規劃見 `project-planning/design.md`。

## 指標定義介面（`types.ts`）

```ts
interface IndicatorParamOption {
  value: string;
  label: string;
}

// 判別聯集：以 type 區分渲染方式。type 省略時視為 'number'，故既有純數值指標定義無需改動。
interface NumberParamSchema {
  key: string;
  label: string;
  type?: 'number';
  default: number;
  min?: number;
  max?: number;
  step?: number;
}
interface EnumParamSchema {
  key: string;
  label: string;
  type: 'enum';
  default: string;
  options: IndicatorParamOption[];
}
interface ColorParamSchema {
  key: string;
  label: string;
  type: 'color';
  default: string;         // `#rrggbb`
}
type IndicatorParamSchema = NumberParamSchema | EnumParamSchema | ColorParamSchema;

type IndicatorParamValues = Record<string, number | string>; // number（數值）或 string（enum/color）

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
  readonly urlCode: string; // share1：URL 分享用的穩定短代碼，與 id 分離
  readonly label: string;
  readonly placement: 'overlay' | 'separate-pane';
  readonly paramsSchema: IndicatorParamSchema[];
  compute(bars: OhlcvBar[], params: IndicatorParamValues): TValue;
  mount(chart: IChartApi, paneIndexAllocator: PaneIndexAllocator, bars: OhlcvBar[], params: IndicatorParamValues): IndicatorMountHandle;
}
```

- `compute()` 必須是純函式：相同 `bars`/`params` 輸入永遠回傳相同輸出，不得讀寫外部狀態、不得修改輸入的 `bars` 陣列。實際數值計算與正確性驗證都靠這個函式的單元測試（不需要真的建立 chart）。
- `urlCode`（share1）：分享連結裡代表這個指標的短代碼（目前 `ma` / `bb`（bollinger） / `md`（macd））。刻意與 `id` 分開——`id` 是程式內部識別、可隨重構更名；`urlCode` **一旦發布就不得更動**，改了會讓既有分享連結解不出該指標（解碼端會逐項捨棄未知代碼，其餘指標照常還原）。全域唯一，只用 `[a-z0-9]`（不含編碼用的分隔字元 `|,~:`）。
- `mount()` 才是有副作用的部分：把 `compute()` 的結果實際掛到 lightweight-charts 的 series/pane 上，回傳的 `IndicatorMountHandle` 讓呼叫端之後可以 `update()`（參數變動時重算+`series.setData()`）或 `dispose()`（移除 series，separate-pane 指標需在自己的 `dispose()` 內呼叫 `paneIndexAllocator.release()` 歸還 pane index——MA、布林通道是 overlay，不使用 `paneIndexAllocator`；MACD 是目前唯一的 separate-pane 指標，完整走過配置/歸還流程，見下方 `macd.ts` 章節）。

## Registry（`registry.ts`）

```ts
registerIndicator(definition): void
getIndicator(id): IndicatorDefinition | undefined
getIndicatorByUrlCode(urlCode): IndicatorDefinition | undefined  // share1 解碼用
listIndicators(): IndicatorDefinition[]
clearIndicators(): void  // 僅測試用，清空整個 registry
```

跟 `lib/data/providers/providerRegistry.ts` 同一種寫法：`Map<string, IndicatorDefinition>`（另有一份 `urlCode → definition` 的反查索引與 id 索引同步維護，重複註冊同一個 `id` 時會先移除舊的 `urlCode` 條目），指標模組（如 `ma.ts`）在檔案最後以 side-effect 呼叫 `registerIndicator()` 自行完成註冊。`IndicatorPanel.tsx` 完全從 `listIndicators()` 動態列出可新增的指標種類，**不在元件內寫死指標清單**——新增指標檔案並註冊後，UI 會自動出現，不需要改 `IndicatorPanel.tsx`。

## `PaneIndexAllocator` 實作（`lib/chart/paneIndexAllocator.ts`）

`createPaneIndexAllocator(reservedCount)` 回傳的實例從 `reservedCount` 開始配置遞增的 pane index，`release(index)` 釋放後該 index 可被下一次 `allocate()` 重用（找最小的未配置 index）。`ChartContainer.tsx` 用 `RESERVED_PANE_COUNT = 2`（pane 0 = K 線、pane 1 = 量能）建立唯一一個 allocator 實例，供 separate-pane 指標（目前為 MACD）共用。

**已知限制**：這個 allocator 只是邏輯上的計數器，並未對應 lightweight-charts 實際的 pane 陣列行為——當一個 pane 內最後一個 series 被移除時，lightweight-charts 會自動移除該 pane 並讓後面的 pane index 往前遞補。目前只驗證過「單一 separate-pane 指標（MACD）新增/移除/再新增」的情境（見 `macd.ts` 章節的手動驗證紀錄），尚未驗證**多個** separate-pane 指標同時存在、且中間那個被移除時，allocator 記錄的 index 與 lightweight-charts 實際 pane 陣列是否仍保持一致（目前只有 MACD 一種 separate-pane 指標，尚無法測試這個多指標情境）。

## 共用色票（`lib/chart/colors.ts`）

集中圖表用色，避免各檔案重複寫死相同色值（indicator8）：

- `UP_COLOR = '#26a69a'` / `DOWN_COLOR = '#ef5350'`：漲跌色，`ChartContainer.tsx` 的量能柱與 `macd.ts` 的 histogram 共用同一份（原本兩處各自定義相同色值，現統一由此匯入）。
- `DEFAULT_LINE_COLOR = '#2196f3'`：lightweight-charts `LineSeries` 的原生預設線色，作為布林通道三軌與 MACD DIF 線色參數的預設值（未調整時外觀與改動前一致）。

> `ma.ts` 仍保留自己的 `DEFAULT_COLOR = '#2196f3'`（值等同 `DEFAULT_LINE_COLOR` 但未併入本檔），這是 indicator8 刻意不擴大 scope 的取捨，已記於 `project-planning/technical-debt.md`。

## MA 指標（`ma.ts`）

- `id: 'ma'`，`urlCode: 'ma'`，`placement: 'overlay'`，`paramsSchema` 三個參數：
  - `period`（週期，number，預設 20，範圍 1–240）。
  - `source`（計算來源，enum，預設 `close`）：`close`/`open`/`high`/`low`/`volume`，對應 `OhlcvBar` 的數值欄位，使 MA 可對成交量或任一價格欄位計算。
  - `color`（線色，color，預設 `#2196f3`＝lightweight-charts `LineSeries` 的原生預設色）。
- `compute(bars, params)`：對 `params.source` 指定的欄位算簡單移動平均（`resolveSource()` 讀取並驗證，非合法值回退 `close`）。實作方式是對每個索引 `i >= period - 1` 取 `bars[i-period+1 ..= i]` 這個視窗算平均——**資料不足 period 天的時間點不會輸出資料點**（不是輸出 `NaN`），所以回傳陣列長度會比 `bars` 短。
- `mount()`：依 `source` 決定掛載的 pane——
  - **價格類來源**（close/open/high/low）掛在主圖 pane 0，用預設 `price` 數字格式。
  - **volume 來源**掛在量能 pane 1（`VOLUME_PANE_INDEX`），與量能柱共用同一個成交量 price scale 並用 `volume` 數字格式。這是必要的：volume 的 MA 數量級（十萬～百萬）遠大於股價，若仍疊在主圖 pane 0 會撐爆價格 scale 把 K 線壓成一條線；掛到量能 pane 後可直接與量能柱對照趨勢。pane 0/1 由 `ChartContainer` 的 `RESERVED_PANE_COUNT = 2` 保留，MA 直接引用這個約定的常數（不經 `paneIndexAllocator`，MA 仍是 overlay）。
  - `addSeries()` 時套 `seriesOptionsForSource(source, color)`（`{ color, priceFormat }`）。`update()` 重新套用 color/priceFormat 與重算 `setData()`；若 `source` 在價格↔volume 之間切換導致目標 pane 改變，用 `series.getPane().paneIndex()` 比對後才呼叫 `series.moveToPane()`（相同 pane 不搬移）。`dispose()` 對應 `chart.removeSeries()`。
- 多條 MA 各為獨立 `IndicatorInstance`，可各設不同 `period`/`source`/`color` 互不干擾。
- 數值正確性已用真實 TWSE 公開數字交叉驗證過（見 `ma.test.ts`，取自 `twseProvider.test.ts` 的 2330 真實收盤價算 MA5 比對）；另有測試涵蓋 volume 來源計算、`source` 未知值回退 close、pane 配置（price→0、volume→1）與 source 切換時的 `moveToPane`、以及 `color` 套用（mount 與 update）。

## 布林通道指標（`bollinger.ts`）

- `id: 'bollinger'`，`urlCode: 'bb'`，`placement: 'overlay'`，`paramsSchema` 有五個參數：`period`（週期，預設 20，範圍 1–240）、`stdDevMultiplier`（標準差倍數，預設 2，範圍 0.5–5），以及三軌線色 `upperColor`/`middleColor`/`lowerColor`（color，皆預設 `DEFAULT_LINE_COLOR`＝`#2196f3`，未調整時三軌同色，與改動前一致）。
- `compute(bars, params)`：與 MA 相同的滑動視窗邏輯，對每個索引 `i >= period - 1` 取 `bars[i-period+1 ..= i]` 這個視窗，算 `close` 的平均（中軌）與**母體標準差**（分母為 `period`，不是 `period - 1`），回傳 `{ time, upper, middle, lower }[]`；資料不足 period 天的時間點不輸出，回傳陣列長度會比 `bars` 短，與 MA 一致。
- `mount()`：依模組常數 `BANDS`（`upper`/`middle`/`lower` 各對應資料欄位與色值參數 key）`chart.addSeries(LineSeries, {}, 0)` 三次疊加在主圖 pane 0。每次 `setData()` 前先 `series.applyOptions({ color })`，色值以 `stringParam(params, band.colorParam, DEFAULT_LINE_COLOR)` 讀取，故 mount 與 `update()` 都會即時套用當前線色。`dispose()` 對三條都呼叫 `chart.removeSeries()`。
- 數值正確性已用真實 TWSE 公開數字交叉驗證過（見 `bollinger.test.ts`，取自 `twseProvider.test.ts` 的 2330 真實收盤價算 period=5 的中軌/上軌/下軌比對），另有測試驗證 `stdDevMultiplier` 越大則帶寬越寬、中軌不受影響；並以 fake-chart 驗證三軌線色參數在 schema 中為 `color` 型別、且 mount/update 依序套到上/中/下軌（未指定的軌回退 `DEFAULT_LINE_COLOR`）。

## MACD 指標（`macd.ts`）

- `id: 'macd'`，`urlCode: 'md'`，`placement: 'separate-pane'`，`paramsSchema` 有五個參數：`fastPeriod`（快線 EMA 週期，預設 12）、`slowPeriod`（慢線 EMA 週期，預設 26）、`signalPeriod`（訊號線 EMA 週期，預設 9），以及 `difColor`（DIF 線色，color，預設 `DEFAULT_LINE_COLOR`＝`#2196f3`）、`deaColor`（DEA 線色，color，預設 `#ff9800`）。
- `compute(bars, params)`：先算 `computeEmaSeries()`（種子為前 period 筆 `close` 的 SMA，之後每筆用標準 EMA 遞迴公式 `value * k + prev * (1-k)`，`k = 2/(period+1)`）分別對 `close` 算快線與慢線 EMA；DIF = 快線 EMA − 慢線 EMA（對齊到兩者都有值的索引，即 `bars` 索引 `slowPeriod-1` 之後）；DEA = 對 DIF 序列再算一次 EMA（週期 `signalPeriod`）；histogram = DIF − DEA。回傳 `{ time, dif, dea, histogram }[]`，資料不足以算出完整 DIF/DEA（`bars.length < slowPeriod + signalPeriod - 1`）時不輸出，與 MA/布林通道一致。
- `mount()`：透過 `paneIndexAllocator.allocate()` 拿一個新的 pane index，在該 pane 疊加兩條 `LineSeries`（DIF/DEA，線色由 `difColor`/`deaColor` 參數決定）+ 一個 `HistogramSeries`。histogram 漲跌色改**讀共用色票** `colors.ts`（≥ 0 用 `UP_COLOR`、< 0 用 `DOWN_COLOR`，與量能柱同一份，不開參數）。`update()` 對 DIF/DEA 重新 `applyOptions({ color })` 後三個 series 都重新 `setData()`；`dispose()` 移除三個 series 後呼叫 `paneIndexAllocator.release(paneIndex)` 歸還 pane index。
- 數值正確性已用手算等差數列（`fastPeriod=2/slowPeriod=4/signalPeriod=2`，精確驗證 DIF/DEA/histogram）與獨立重寫的 EMA/MACD 公式交叉驗證非平凡序列（見 `macd.test.ts`）；另有測試涵蓋「剛好足夠資料量輸出一筆」與「資料不足回傳空陣列」的邊界情況，以及以 fake-chart 驗證 `difColor`/`deaColor` 在 mount/update 套到對應 series、histogram 各柱色值取自共用 `UP_COLOR`/`DOWN_COLOR`。

## 指標清單 UI（`components/chart/IndicatorPanel.tsx` + `App.tsx`）

`IndicatorPanel` 是純展示元件：

- Props：`instances`（目前所有 `IndicatorInstance`）、`onAdd(definitionId)`、`onRemove(instanceId)`、`onParamsChange(instanceId, params)`。
- 上方列出 `listIndicators()` 回傳的每個指標定義的「+ 新增」按鈕；下方列出每個 `instance`，依 `definition.paramsSchema` 動態產生參數輸入元件，並有一個移除按鈕。
- 每個參數的輸入元件由 `paramInput.ts` 的純函式 `resolveParamInput(schema, params)` 決定要渲染哪一種：`number` → `<input type="number">`、`enum` → `<select>`（選項來自 `schema.options`）、`color` → `<input type="color">`。輸入變動時以 `coerceParamValue(schema, raw)` 依型別把原始字串回寫成正確型別（`number` 型別化為數字，`enum`/`color` 保留 string）。渲染決策與型別轉換抽成純函式（不觸 DOM），以 `paramInput.test.ts` 用含 number/enum/color 三型別的測試 schema 單元驗證（本專案無 jsdom 測試環境）。
- `types.ts` 另提供兩個讀參數 helper：`numberParam(params, key, fallback)` 讀數值型參數並容忍以 string 儲存的數字（分享還原等情境），缺值/空字串/非數字時回退 `fallback`；`stringParam(params, key, fallback)` 讀字串型（enum/color）參數，非字串或空字串時回退 `fallback`。`ma.ts`/`bollinger.ts`/`macd.ts` 的 `compute()` 用 `numberParam` 讀週期等數值參數；`ma.ts` 的 `mount()` 用 `stringParam` 讀 `source`/`color`，`bollinger.ts`/`macd.ts` 的 `mount()` 亦用 `stringParam` 讀各線色參數。

實際狀態管理與 chart 掛載邏輯在別處：

- `App.tsx` 用 `useState<IndicatorInstance[]>` 管理實例陣列，`addIndicator()`（用 `crypto.randomUUID()` 產生實例 id、依 `paramsSchema` 的 `default` 值初始化參數）、`removeIndicator()`、`updateIndicatorParams()` 三個函式對應 `IndicatorPanel` 的三個 callback，並把 `indicators` 陣列與 `bars` 一起傳給 `<ChartContainer>`。初始值來自 URL 分享連結（share2，見 [share.md](share.md)）：有 `#s=` 時以還原出的指標開場，實例 id 一律重新產生（uuid 不進分享連結）。
- `ChartContainer.tsx` 新增了 `indicators` prop，內部用一個 `useEffect`（依賴 `[data, indicators]`）做 reconcile：比對目前 `indicators` 的 id 集合與已掛載（`mountedIndicatorsRef` 這個 `Map<instanceId, IndicatorMountHandle>`）的差異——不在集合中的呼叫 `dispose()` 並從 map 移除；在集合中的若已掛載就呼叫 `update(data, instance.params)`，未掛載則呼叫 `definition.mount()` 並存入 map。**這個 effect 對所有仍掛載的實例都無條件呼叫 `update()`，沒有做「這個實例的 params 到底有沒有變」的診斷**（已記錄在 `project-planning/technical-debt.md`）。
- 元件卸載（chart 被移除）時，所有已掛載指標的 `dispose()` 都會被呼叫，確保不留下孤兒 series。

## 手動驗證紀錄

以下項目已在真實瀏覽器（`npm run dev`）手動點擊驗證過（sandbox 環境擋外部網路，無法真的抓到 TWSE 資料，因此圖表上沒有 K 線可看、也就看不到 MA 線疊加的視覺效果，但下列互動邏輯本身是對著真實 `IChartApi` 執行的）：

- 新增兩個 MA 實例，各自獨立顯示週期輸入框（預設 20）。
- 把其中一個實例的週期改成 5，另一個維持 20 不受影響。
- 移除其中一個實例，只有該實例消失，另一個維持正常。
- 新增一個布林通道實例，正確顯示「週期」與「標準差倍數」兩個輸入框（預設 20 / 2）。
- 把布林通道的週期改成 10，輸入框即時反映新值。
- 移除布林通道實例，`IndicatorPanel` 清單正確消失。
- 新增一個 MACD 實例，正確顯示「快線/慢線/訊號線週期」三個輸入框（預設 12/26/9）。
- 移除 MACD 實例後（釋放 pane index），再新增一次 MACD，正常掛載不衝突。
- 同時啟用 MA + 布林通道 + MACD 三種指標，三者並存、互不影響（[indicator5](../project-planning/task-pool/indicator5.md) 驗收方式第 1 點）。
- 在上述基礎上再新增第二個 MA 實例（週期改成 5），與原本的 MA20 互不干擾共存（indicator5 驗收方式第 2 點）。
- 移除其中的布林通道實例，只有它消失，其餘 MA20/MACD/MA5 三個維持正常顯示（indicator5 驗收方式第 3 點）。
- 全程瀏覽器 console 無錯誤。

## 已知限制 / 尚未實作

- 因為 sandbox 網路限制，MA／布林通道／MACD 疊加到圖表上的**視覺效果**未經肉眼確認，只驗證過互動邏輯（見上）與 `compute()` 數值正確性。MA 的 `source`/`color`/pane 配置（含 volume 掛到量能 pane、source 切換時 `moveToPane`）、布林三軌線色、MACD `difColor`/`deaColor` 與 histogram 共用色票，亦僅以 fake-chart 單元測試驗證契約，未經真實瀏覽器肉眼確認渲染效果。
- `PaneIndexAllocator` 尚未驗證「多個 separate-pane 指標同時存在」的情境（見上方章節說明），因為目前只有 MACD 一種 separate-pane 指標。
