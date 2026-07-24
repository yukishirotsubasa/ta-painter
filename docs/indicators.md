# 技術指標架構（`web/src/lib/chart/indicators/`、`components/chart/IndicatorPanel.tsx`）

> 本文件記錄**已實作**的指標可擴充架構與目前已完成的 15 個指標：疊主圖的 MA、EMA、布林通道、SAR、頭底分析，與各佔子 pane 的 MACD、KD、RSI、ATR、DMI／ADX、CCI、威廉指標 %R、BIAS、ROC、OBV。指標**有兩個編輯入口**：設定面板內的完整清單（`IndicatorPanel`，可新增／移除／改參數）與圖表上方的圖例 chip（`IndicatorLegend`，點開單一指標的參數小面板，responsive2），兩者共用同一份參數欄位元件。整體規劃見 `project-planning/design.md`。
>
> **新增一個指標要碰的檔案**：新增 `indicators/<name>.ts`（檔尾 `registerIndicator()`）、附 `<name>.test.ts`、在 `indicators/registerAll.ts` 加一行 side-effect import。UI（`IndicatorPanel` 的新增下拉、圖例 chip）與分享連結編碼都從 registry 動態產生，**不需改動**。

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

interface IndicatorTooltipRow {
  label: string;                 // 顯示名稱，含識別參數（'MA20'、'布林上軌'、'DIF'）
  color: string;                 // 色點顏色，取自該 series 目前線色
  series: ISeriesApi<SeriesType>;// tooltip 端以 param.seriesData.get(series) 取當日值
}

interface IndicatorMountHandle {
  update(bars: OhlcvBar[], params: IndicatorParamValues): void;
  dispose(): void;
  tooltipRows?(): IndicatorTooltipRow[]; // chart6：選用，交出各線給滑鼠 tooltip；未實作者不出現
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
- `tooltipRows?()`（chart6，選用）：交出此指標各條 series 的顯示列（`{ label, color, series }`）給滑鼠 tooltip；值不在此重算，由 tooltip 端以 `param.seriesData.get(series)` 取當日值。14 個有逐日值的指標都實作（單線帶週期標籤如 `MA20`；多線各一列如 Bollinger 三軌、MACD `DIF/DEA/MACD柱`、KD `K/D`、DMI `+DI/−DI/ADX`）；**頭底分析刻意不實作**（稀疏樞紐點＋箭頭 marker，無逐日值）。詳見 [`tooltip.md`](tooltip.md)。

## Registry（`registry.ts`）

```ts
registerIndicator(definition): void
getIndicator(id): IndicatorDefinition | undefined
getIndicatorByUrlCode(urlCode): IndicatorDefinition | undefined  // share1 解碼用
listIndicators(): IndicatorDefinition[]
clearIndicators(): void  // 僅測試用，清空整個 registry
```

跟 `lib/data/providers/providerRegistry.ts` 同一種寫法：`Map<string, IndicatorDefinition>`（另有一份 `urlCode → definition` 的反查索引與 id 索引同步維護，重複註冊同一個 `id` 時會先移除舊的 `urlCode` 條目），指標模組（如 `ma.ts`）在檔案最後以 side-effect 呼叫 `registerIndicator()` 自行完成註冊。`IndicatorPanel.tsx` 完全從 `listIndicators()` 動態列出可新增的指標種類，**不在元件內寫死指標清單**——新增指標檔案並註冊後，UI 會自動出現，不需要改 `IndicatorPanel.tsx`。

### 一次註冊全部指標（`registerAll.ts`）

`registerAll.ts` 是**指標清單唯一被列舉的地方**：把 15 個指標模組全部 side-effect import 進來。`App.tsx` 與需要完整 registry 的測試（`urlState.test.ts` / `shareUrl.test.ts` / `registerAll.test.ts`）都只 import 這一個檔案，取代原本各自列 `import './ma'`（等三行）。`listIndicators()` 的順序即此檔的 import 順序，也就是 UI 新增下拉的順序：先 overlay（MA/EMA/布林/SAR/頭底分析），再 separate-pane（MACD/KD/RSI/ATR/DMI/CCI/威廉/BIAS/ROC/OBV）。

**一個排序陷阱**：`dmi.ts` import 了 `atr.ts` 的 `trueRange()`，被 import 的模組會先執行其檔尾的 `registerIndicator()`。因此 `registerAll.ts` 內 ATR 刻意排在 DMI 之前，讓「宣告順序」與「實際註冊順序」一致（否則 ATR 會因為被 DMI 牽引而提早註冊、跑到 DMI 前面，UI 順序與此檔行序對不上）。`registerAll.test.ts` 以精確的 id 陣列鎖住這個順序，並一併守住「urlCode 全域唯一、只含 `[a-z0-9]`、每個參數都有 default、`compute([], {})` 不丟例外」等全域約束。

### 共用計算 helper（indicator12）

15 個指標大量共用滾動視窗計算與價格來源選項，集中在三個檔：

- **`movingAverage.ts`**：`sma` / `ema`（`k = 2/(period+1)`，種子為前 period 筆 SMA）/ `wilderRma`（Wilder 平滑，`k = 1/period`，RSI/ATR/DMI 用）/ `rollingMax` / `rollingMin`。**統一對齊規則**：回傳陣列第 0 筆對齊 `values[period - 1]`，長度 `values.length - period + 1`，資料不足回空陣列——與既有「資料不足的時間點不輸出」慣例一致，呼叫端一律用 `barIndex = period - 1 + i` 對回 bars。
- **`priceSource.ts`**：MA 與 EMA 共用的「計算來源」——`PRICE_SOURCE_OPTIONS`（close/open/high/low/volume）、`resolveSource()`（非法值回退 close）、`sourceValues()`、`paneIndexForSource()`（volume 掛量能 pane）、`seriesOptionsForSource()`（volume 用 volume 數字格式）。
- **`referenceLines.ts`**：`createReferenceLines(series, levels, color?)` → `{ dispose() }`，內部用 `series.createPriceLine()` / `removePriceLine()` 畫水平虛線。RSI(30/70)、KD(20/80)、CCI(±100)、威廉(−20/−80)、BIAS/ROC(0)、DMI(25) 共用。色值為 `colors.ts` 的 `REFERENCE_LINE_COLOR = '#5a5d6b'`（不開放參數）。用 price line 而非額外 series，參考線因此不進入自動縮放範圍、也不出現在圖例上。

`ma.ts` / `bollinger.ts` / `macd.ts` 均已改為引用這些 helper，且既有測試檔一字未動全過（重構未改行為的證明）。

### 指標測試用 fake chart（`testFakeChart.ts`，僅測試用）

集中一份 fake `IChartApi` / `PaneIndexAllocator`，取代先前每個指標測試各自複製的 fake。涵蓋 `addSeries`／`removeSeries`（以 series api 物件身分精確對上 record，用 WeakMap）／`panes`／`setData`／`applyOptions`／`getPane`／`moveToPane`／`createPriceLine`／`removePriceLine`／`attachPrimitive`／`detachPrimitive`（後兩者讓 `createSeriesMarkers()` 能真的跑起來）。另附 `closeBar` / `closeBars` / `isoDay` 造測試資料。沒有任何正式程式碼 import 它，不進 bundle。

## `PaneIndexAllocator` 實作（`lib/chart/paneIndexAllocator.ts`）

`createPaneIndexAllocator(chart, reservedCount)` 回傳的實例，`allocate()` 一律回傳 `Math.max(reservedCount, chart.panes().length)`——也就是**圖表目前實際的 pane 數量**，不自維「已配置 index 集合」（indicator10）。`ChartContainer.tsx` 以 `chart` 與 `RESERVED_PANE_COUNT`（見下方 `panes.ts`）建立唯一一個 allocator 實例，供 separate-pane 指標（目前為 MACD）共用。

`chart` 參數的型別是本檔自訂的最小介面 `PaneCountSource { panes(): readonly unknown[] }`（`IChartApi` 直接滿足），測試才能餵 fake chart。

**為什麼查 `chart.panes()` 而不是自己算**：lightweight-charts 在某個 pane 的最後一個 series 被移除時會自動刪掉該 pane，後面的 pane index 往前遞補。自維計數器不會知道這件事，兩個 separate-pane 指標同時存在、移除前面那個時就會與實際位置對不上（allocator 以為下一個是 4，實際上該配 3）。改查實際數量後這個不一致從根本消失，`release(paneIndex)` 也就沒有東西要清——保留為 no-op 只是為了不動 `PaneIndexAllocator` 介面與三個指標的 `mount()` 簽章（`macd.ts` 的 `dispose()` 仍會呼叫它）。

`paneIndexAllocator.test.ts` 用 fake chart（pane 以字串陣列表示，移除時 `splice` 模擬 index 前移）涵蓋「新增 → 移除 → 再新增」與「兩個 separate-pane 同時存在、移除前面那個」；真實瀏覽器則手測過 MACD 的新增／移除／再新增。

## 保留 pane 佈局（`lib/chart/panes.ts`）

pane index 的單一來源（indicator9），`ChartContainer.tsx` 與 `ma.ts` 共同引用，兩邊不再各自宣告：

- `PRICE_PANE_INDEX = 0`：K 線主圖。
- `VOLUME_PANE_INDEX = 1`：量能柱；`source=volume` 的指標掛在此以共用成交量 scale。
- `RESERVED_PANE_COUNT = 2`：separate-pane 指標的起始 index，傳給 `createPaneIndexAllocator()`。

這些值由 `ChartContainer` 建立 series 的順序決定（先 candlestick、再 volume histogram），改動順序時要一起改本檔。

## 共用色票（`lib/chart/colors.ts`）

集中圖表用色，避免各檔案重複寫死相同色值（indicator8）：

- `UP_COLOR = '#26a69a'` / `DOWN_COLOR = '#ef5350'`：漲跌色，`ChartContainer.tsx` 的量能柱與 `macd.ts` 的 histogram 共用同一份（原本兩處各自定義相同色值，現統一由此匯入）。
- `DEFAULT_LINE_COLOR = '#2196f3'`：lightweight-charts `LineSeries` 的原生預設線色，作為 MA、布林通道三軌與 MACD DIF 線色參數的預設值（未調整時外觀與改動前一致）。`ma.ts` 原本自留一份同值的 `DEFAULT_COLOR`，indicator9 已改為引用本常數。
- `DEFAULT_DRAWING_LINE_COLOR = '#f5a623'`：手繪趨勢線的預設色（drawing7），詳見 [`drawing.md`](drawing.md)。
- `CHART_TEXT_COLOR = '#9ca3af'` / `CHART_GRID_COLOR = '#2e303a'`（chart4）：`ChartContainer.tsx` 建立圖表時的 `layout.textColor` 與 `grid.vertLines/horzLines.color`，取代原本寫死的 hex。值對齊 `index.css` `:root` 的 `--text`／`--border`。

### 整站固定 dark（chart4）

`index.css` 的 `:root` 直接採用深色值、`color-scheme: dark`，**沒有** `prefers-color-scheme` 分支也沒有主題切換 UI；`index.html` 的 `<meta name="theme-color" content="#16171d">` 讓行動版瀏覽器 chrome 一併深色。動機是分享情境——同一張圖／同一條連結會在別人的裝置上開啟，`screenshot.ts` 的底色取自頁面 `--bg`，若跟隨系統主題，淺色使用者會截出白底配深色格線的圖。固定深色後截圖結果恆定。

因為 lightweight-charts 走 canvas 渲染、讀不到 CSS variable，上述兩個常數與 CSS 變數是**兩份人工同步的色值**，改一邊要記得改另一邊（兩處皆有註解），已記於 [`technical-debt.md`](../project-planning/technical-debt.md)。

## MA 指標（`ma.ts`）

- `id: 'ma'`，`urlCode: 'ma'`，`placement: 'overlay'`，`paramsSchema` 三個參數：
  - `period`（週期，number，預設 20，範圍 1–240）。
  - `source`（計算來源，enum，預設 `close`）：`close`/`open`/`high`/`low`/`volume`，對應 `OhlcvBar` 的數值欄位，使 MA 可對成交量或任一價格欄位計算。
  - `color`（線色，color，預設 `#2196f3`＝lightweight-charts `LineSeries` 的原生預設色）。
- `compute(bars, params)`：對 `params.source` 指定的欄位算簡單移動平均（`resolveSource()` 讀取並驗證，非合法值回退 `close`）。實作方式是對每個索引 `i >= period - 1` 取 `bars[i-period+1 ..= i]` 這個視窗算平均——**資料不足 period 天的時間點不會輸出資料點**（不是輸出 `NaN`），所以回傳陣列長度會比 `bars` 短。
- `mount()`：依 `source` 決定掛載的 pane——
  - **價格類來源**（close/open/high/low）掛在主圖 pane 0，用預設 `price` 數字格式。
  - **volume 來源**掛在量能 pane 1（`VOLUME_PANE_INDEX`），與量能柱共用同一個成交量 price scale 並用 `volume` 數字格式。這是必要的：volume 的 MA 數量級（十萬～百萬）遠大於股價，若仍疊在主圖 pane 0 會撐爆價格 scale 把 K 線壓成一條線；掛到量能 pane 後可直接與量能柱對照趨勢。pane 0/1 的常數由 `lib/chart/panes.ts` 統一提供（`PRICE_PANE_INDEX`/`VOLUME_PANE_INDEX`），`ma.ts` 與 `ChartContainer.tsx` 共同引用（MA 仍是 overlay，不經 `paneIndexAllocator`）。
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
- 參數欄位本身抽成 `components/chart/IndicatorParamFields.tsx`（responsive2），供**兩個入口共用**：側邊欄／設定面板的 `IndicatorPanel`，以及圖例 chip 展開的參數小面板。Props 為 `{ definition, params, onChange(params), idPrefix }`——`idPrefix` 是必要的，同一畫面可能同時存在兩處相同欄位（`indicator-panel-{instanceId}` vs `legend-{instanceId}`），id 撞了會讓 `<label htmlFor>` 綁到錯的 input。樣式在 `IndicatorParamFields.css`（`.indicator-param`）。
- 每個參數的輸入元件由 `paramInput.ts` 的純函式 `resolveParamInput(schema, params)` 決定要渲染哪一種：`number` → `<input type="number">`、`enum` → `<select>`（選項來自 `schema.options`）、`color` → `<input type="color">`。輸入變動時以 `coerceParamValue(schema, raw)` 依型別把原始字串回寫成正確型別（`number` 型別化為數字，`enum`/`color` 保留 string）。渲染決策與型別轉換抽成純函式（不觸 DOM），以 `paramInput.test.ts` 用含 number/enum/color 三型別的測試 schema 單元驗證（本專案無 jsdom 測試環境）。

## 常見指標（indicator14–22）

以下指標的 `compute()` 皆為純函式、資料不足時不輸出對應時間點（與 MA/布林/MACD 一致），數值正確性以手算基準 + 獨立重寫實作交叉驗證（見各 `*.test.ts`），`mount()` 契約（pane 配置、色值套用、參考線、dispose 清理）以 `testFakeChart` 驗證。separate-pane 指標一律透過 `paneIndexAllocator.allocate()` 取得 pane、`dispose()` 內 `release()` 歸還。

| 指標 | 檔案 | id / urlCode | placement | 主要參數（預設） | 計算重點 |
|---|---|---|---|---|---|
| 指數移動平均 EMA | `ema.ts` | `ema` / `em` | overlay | period(12)、source、color | `ema()`；與 MA 共用 `priceSource`，volume 來源掛量能 pane |
| 隨機指標 KD | `kd.ts` | `kd` / `kd` | separate-pane | rsvPeriod(9)、kPeriod(3)、dPeriod(3)、kColor、dColor | RSV=(C−Lmin)/(Hmax−Lmin)×100；K/D 遞迴平滑，初值 50；無波動視窗 RSV 取中性 50；20/80 參考線 |
| 相對強弱 RSI | `rsi.ts` | `rsi` / `rs` | separate-pane | period(14)、color | 漲/跌幅各 `wilderRma`，RSI=100−100/(1+RS)；平均跌幅為 0 輸出 100；需 period+1 根；30/70 參考線 |
| 真實波幅 ATR | `atr.ts` | `atr` / `at` | separate-pane | period(14)、color | 匯出 `trueRange(bars)`（首根取高低差）；ATR=`wilderRma(TR)` |
| 趨向 DMI／ADX | `dmi.ts` | `dmi` / `dm` | separate-pane | period(14)、adxPeriod(14)、plusColor、minusColor、adxColor | ±DI=100×RMA(±DM)/RMA(TR)；DX=100×\|+DI−−DI\|/(+DI+−DI)；ADX=`wilderRma(DX)`；ADX 未成形時該點不輸出（線不從 0 拉起）；用 `atr.ts` 的 `trueRange`；25 參考線 |
| 順勢 CCI | `cci.ts` | `cci` / `cc` | separate-pane | period(20)、color | TP=(H+L+C)/3；CCI=(TP−SMA(TP))/(0.015×平均絕對偏差)；偏差為 0 輸出 0；±100 參考線 |
| 威廉指標 %R | `williams.ts` | `williams` / `wr` | separate-pane | period(14)、color | %R=(Hmax−C)/(Hmax−Lmin)×−100，值域 −100~0；無波動取 −50；與 KD 的 RSV 互為鏡像（%R=RSV−100）；−20/−80 參考線 |
| 乖離率 BIAS | `bias.ts` | `bias` / `bi` | separate-pane | period(10)、color | BIAS=(C−SMA)/SMA×100；0 軸參考線 |
| 動能 ROC | `roc.ts` | `roc` / `rc` | separate-pane | period(12)、color | ROC=(C−C[i−n])/C[i−n]×100，前 period 根不輸出；0 軸參考線 |
| 能量潮 OBV | `obv.ts` | `obv` / `ob` | separate-pane | color | C>前收加 volume、< 減、= 不變，首根從 0；每根都有值（無暖身）；`priceFormat: volume` |
| 拋物線轉向 SAR | `sar.ts` | `sar` / `sr` | overlay | step(0.02)、maxStep(0.2)、longColor、shortColor | Wilder SAR；至少 3 根；`LineSeries` 搭 `{ lineVisible: false, pointMarkersVisible: true }` + `LineData.color` 逐點上色（多空分色）渲染成點列 |

多空/漲跌相關色值（DMI 的 ±DI、SAR 的多空點）預設沿用共用色票 `UP_COLOR`/`DOWN_COLOR`，其餘線色預設 `DEFAULT_LINE_COLOR`。

## 頭底分析（`headBottom.ts`，indicator23）

使用者指定的自訂分析方式：`id: 'headBottom'`、`urlCode: 'hb'`、`placement: 'overlay'`。以可調週期的均線為基準，收盤價每次穿越均線就在**上一個區間**取極值標成「頭」或「底」，再把頭底頭底連成折線。

- **參數**：`period`（均線週期，預設 5，1–240）、`color`（連線色，預設紫 `#ab47bc`，與既有藍/橘/黃/紅綠區隔）。
- **`compute()` → `HeadBottomPoint[]`（`{ time, price, kind: 'head' | 'bottom' }`）**：
  1. `sma(closes, period)` 算均線，`isAbove(i) = close[i] > ma[i]`。**相等視為「不在上方」**，避免貼著均線走時同一根反覆觸發。
  2. `isAbove` 相鄰翻轉即一次突破。
  3. 每次突破回頭看**半開區間** `[上一次突破位置, 這次突破前一根]`（第一次突破的起點用 `period - 1`＝均線第一個有值的位置）：向上突破取該區間 `low` 最小值 →「底」；向下突破取 `high` 最大值 →「頭」。極值同值取**較早**一根。
  4. **最後一次突破之後的區間不輸出**——尚未被下一次突破確認，極值會隨新 K 棒變動（使用者明確選擇「完全不畫」）。
  5. `bars.length < period`、全程無穿越、全平盤 → 回空陣列。
- **`mount()`**：主圖 pane 0 掛一條 `LineSeries` 並**只餵樞紐點**——lightweight-charts 自動把相鄰資料點連成直線，於是頭→底→頭→底 自然成為折線，**不需要自訂 primitive**。另用 `createSeriesMarkers()` 標「頭」（`aboveBar` + `arrowDown`）／「底」（`belowBar` + `arrowUp`），標記由匯出的純函式 `toHeadBottomMarkers()` 產生（測試不必碰 markers plugin）。折線只在樞紐點有資料，故關掉 `lastValueVisible`／`priceLineVisible`。`dispose()` 先 `markers.detach()` 再 `chart.removeSeries()`。
- 頭底分析**不另外畫出所依據的均線**；使用者可自行加一個同週期 MA 指標對照。

## 指標新增 UI 改為下拉選單（indicator13）

指標從 3 個增加到 15 個後，`IndicatorPanel` 的新增入口改為 `<select>`（選項來自 `listIndicators()`，仍不寫死清單）+ 一顆「+ 新增」按鈕，以 `useState` 記住目前選取的 `definitionId`。原本平鋪的「+ 指標名」按鈕在側邊欄 260px 寬度下會變成一整面按鈕牆。`IndicatorPanel.css` 的 `.indicator-panel-add` 對應改為 `select` 佔滿剩餘寬度、按鈕不縮。

## 圖例 chip（`components/chart/IndicatorLegend.tsx` + `IndicatorChips.tsx`，responsive2）

覆蓋在圖表左上角的已啟用指標圖例，桌面／行動共用：chip 橫向可捲，點擊在正下方展開該指標的參數小面板（`IndicatorParamFields` + 移除鈕）。chip 文字與色點由純函式 `lib/chart/indicators/chipLabel.ts` 產生：

- `indicatorShortLabel('移動平均線（MA）') === 'MA'`（取全形括號內；無括號用原標籤）
- `indicatorChipLabel(definition, params)` → `MA(60)`／`MACD(12,26,9)`／`Bollinger Bands(20,2)`：簡稱 + **數值參數**，缺值時取 schema `default`，`enum`/`color` 不入 chip
- `indicatorChipColor(definition, params)` → 第一個 `type: 'color'` 參數的目前值，無顏色參數則 `null`（不畫色點）

版面、疊層與互斥規則見 [`responsive.md`](responsive.md)。
- `types.ts` 另提供兩個讀參數 helper：`numberParam(params, key, fallback)` 讀數值型參數並容忍以 string 儲存的數字（分享還原等情境），缺值/空字串/非數字時回退 `fallback`；`stringParam(params, key, fallback)` 讀字串型（enum/color）參數，非字串或空字串時回退 `fallback`。`ma.ts`/`bollinger.ts`/`macd.ts` 的 `compute()` 用 `numberParam` 讀週期等數值參數；`ma.ts` 的 `mount()` 用 `stringParam` 讀 `source`/`color`，`bollinger.ts`/`macd.ts` 的 `mount()` 亦用 `stringParam` 讀各線色參數。

實際狀態管理與 chart 掛載邏輯在別處：

- `App.tsx` 用 `useState<IndicatorInstance[]>` 管理實例陣列，`addIndicator()`（用 `crypto.randomUUID()` 產生實例 id、依 `paramsSchema` 的 `default` 值初始化參數）、`removeIndicator()`、`updateIndicatorParams()` 三個函式對應 `IndicatorPanel` 的三個 callback，並把 `indicators` 陣列與 `bars` 一起傳給 `<ChartContainer>`。初始值來自 URL 分享連結（share2，見 [share.md](share.md)）：有 `#s=` 時以還原出的指標開場，實例 id 一律重新產生（uuid 不進分享連結）。
- `ChartContainer.tsx` 有 `indicators` prop，內部一個 `useEffect`（依賴 `[data, indicators]`）把工作全部交給 `lib/chart/indicators/reconcile.ts` 的 `reconcileIndicators({ chart, paneIndexAllocator, data, instances, mounted })`（indicator11 抽出，元件本身不再有 reconcile 邏輯）。`mounted` 是 `mountedIndicatorsRef` 持有的 `Map<instanceId, MountedIndicator>`，會被就地增刪改。
- `reconcileIndicators()` 的三段行為：不在 `instances` id 集合中的呼叫 `handle.dispose()` 並從 map 移除；未掛載的呼叫 `definition.mount()` 存入 map；已掛載的**只在 `data` 參考變動或 `params` 淺層 diff 有異時**才呼叫 `update()`，否則整個跳過（避免調整單一指標參數連帶重算重繪其他指標）。`definitionId` 查不到定義的實例直接忽略。
- `MountedIndicator` 除了 `handle` 還記著 `appliedParams`／`appliedData`——上次真正套用進圖表的參考，即為變更偵測的比較基準。`params` 是扁平的 `Record<string, number | string>`（indicator6 起），故比較是鍵數相同 + 每個鍵 `Object.is()` 相等，不做深層 diff。
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
- 移除 MACD 實例後（pane 被 lightweight-charts 回收），再新增一次 MACD，正常掛載不衝突（indicator10 改為查 `chart.panes()` 後於 2026-07-24 重測，pane 位置與高度正常、無空白 pane）。
- 同時啟用 MA + 布林通道 + MACD 三種指標，三者並存、互不影響（[indicator5](../project-planning/task-pool/indicator5.md) 驗收方式第 1 點）。
- 在上述基礎上再新增第二個 MA 實例（週期改成 5），與原本的 MA20 互不干擾共存（indicator5 驗收方式第 2 點）。
- 移除其中的布林通道實例，只有它消失，其餘 MA20/MACD/MA5 三個維持正常顯示（indicator5 驗收方式第 3 點）。
- 全程瀏覽器 console 無錯誤。

### indicator12–23（2026-07-24）

- 新增下拉選單列出全部 15 個指標，順序與 `registerAll.ts` 一致。
- 一次掛上 13 個指標（含 8 個 separate-pane），各自取得獨立 pane、console 零錯誤。
- 移除中間兩個 separate-pane 指標（RSI、DMI）後再新增 8 個指標，pane 正常回收、不衝突。
- 圖例 chip 標籤正確（`頭底分析(5)`／`KD(9,3,3)`／`%R(14)`／`OBV` 等），參數欄位與各指標 `paramsSchema` 對應。
- 帶 15 個指標的分享連結（`#s=`）還原後指標清單、chip、參數皆與原狀態一致。

## 已知限制 / 尚未實作

- 因為 sandbox 網路限制，指標疊加到圖表上的**視覺效果**（含頭底分析的折線與頭/底標記位置、SAR 點列、各 separate-pane 指標的線形與參考線）未經肉眼確認，只驗證過互動邏輯（見上）與 `compute()` 數值正確性、`mount()` 契約（fake-chart）。本輪嘗試以 stub `window.fetch` + 預塞月快取餵合成 K 線，但此 sandbox 的 Browser pane 走不完 app 自身的資料查詢路徑（圖表始終無 K 線、canvas 不 compositing 故無法截圖），圖表渲染樣貌需在本機 `npm run dev` 肉眼複測。
- 頭底分析、SAR 用到的 `createSeriesMarkers()` / `LineData` 逐點上色 / price line 參考線，僅以 `testFakeChart` 驗證契約，真實渲染未經肉眼確認。
