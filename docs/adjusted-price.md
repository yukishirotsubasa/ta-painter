# 還原權值（Adjusted Price）

> 本文件記錄**已實作**的還原權值功能：把配股配息／股票分割造成的價格跳空還原，讓 K 線與技術指標在跳空處不失真。相關資料層見 [data-layer.md](data-layer.md)、持久化見 [persistence.md](persistence.md)、分享編碼見 [share.md](share.md)。

## 為什麼需要

原始價在除權息／配股配息／股票分割當日會出現跳空，使 MA、MACD 等指標在跳空處失真、趨勢被扭曲。還原價把歷史價格依公司行動的還原因子調整，消除人為跳空。

## 可行性：僅 Yahoo 源

- **Yahoo 源可行且成本低**：`/v8/finance/chart` 端點加 `&events=div|split` 即回傳 `indicators.adjclose[0].adjclose`（已對除權息＋分割還原的收盤序列），worker proxy 為通用轉發、不需改。
- **官方源（TWSE／TPEx）不支援**：`STOCK_DAY`／`tradingStock` 只回原始價，要另接除權息端點＋自寫還原演算法，工程量遠大於 Yahoo，本次不做——改以「官方源時停用開關」處理（見下）。

## 還原因子與換算（`web/src/lib/data/adjustment.ts`）

還原因子 `factor = adjClose / close`（Yahoo 的 `adjclose` 已以最新為基準還原，各查詢批次同基準，往前動態載入併入更舊資料仍一致）。把 factor 乘回 OHL、close 直接取 `adjClose`，即得整組還原 OHLC。

```ts
toAdjustedBars(bars: OhlcvBar[]): OhlcvBar[]
detectAdjustmentDates(bars: OhlcvBar[]): string[]
```

- `toAdjustedBars`：有 `adjClose` 的 bar 回 `{ ...bar, open/high/low × factor, close: adjClose }`；`close === 0` 或無 `adjClose` 者**原樣保留（原物件參考）**、factor 視為 1。`close × factor === adjClose`，故還原後 close 精確等於 adjClose。
- `detectAdjustmentDates`：逐根比較相鄰有效 factor，相對變化超過門檻（`1e-4`，濾除浮點雜訊）即視為除權息／分割日，回傳該 bar 的 `time`；無 `adjClose` 的 bar 略過、不更新比較基準（不誤判缺值為變動）。
- **成交量不還原**：`adjclose` 混合了配息與分割，其 factor 對量能無正確物理意義（配息不影響成交量），台股分割罕見，故 `volume`／`time` 維持原始。見 [technical-debt.md](../project-planning/technical-debt.md)。

`adjustment.test.ts` 涵蓋 factor 套用、原物件保留、close=0 邊界、混合輸入、跳階偵測、次門檻雜訊、缺值略過、全無 factor。

## 整張圖還原（`web/src/App.tsx`）

採**整張圖還原**：開關開啟時 K 線與所有指標同步改用還原價（跳空抹平、指標貼合 K 棒）。作法是在資料進入 `ChartContainer` 前就把 `bars` 換掉，**指標層零改動**（指標吃到的 `bars` 已是還原值）。

```ts
const canAdjust = dataSource === 'yahoo';           // 只有 Yahoo 有 adjClose
const effectiveAdjusted = useAdjusted && canAdjust;
const displayBars = useMemo(
  () => (effectiveAdjusted ? toAdjustedBars(bars) : bars),
  [bars, effectiveAdjusted],
);                                                  // K 線 + 指標都吃這份
const adjustmentDates = useMemo(() => detectAdjustmentDates(bars), [bars]); // 兩種模式都標示
// <ChartContainer data={displayBars} adjustmentDates={adjustmentDates} … />
```

- `useMemo` 讓 `bars`／開關未變時 `displayBars` 參考穩定，避免 `reconcileIndicators`（以 `data` 參考變動為依據）無謂重算。
- `adjustmentDates` 一律從**原始 `bars`** 偵測，還原模式雖無跳空，垂直線仍標出當日曾發生除權息。

## 開關 UI（`web/src/components/sidebar/AdjustedPriceToggle.tsx`）

側邊欄常駐 checkbox，掛在 `App.tsx` 的 `settings` JSX、`DataSourcePanel` 之後。`dataSource === 'official'` 時 `disabled` 並顯示「僅 Yahoo 源支援還原價」——官方源無 `adjClose`，切過去也不會還原。

## 除權息標註：全高垂直線（`web/src/lib/chart/verticalLinePrimitive.ts`）

`VerticalLinePrimitive` 是 `ISeriesPrimitive`，仿 [`drawing/trendLinePrimitive.ts`](drawing.md)：在除權息／分割日的時間座標畫一條**貫穿整個 pane 高度**的金色虛線（`ADJUSTMENT_LINE_COLOR = rgba(250,204,21,0.65)`）＋線頂「息」標籤。儲存邏輯時間（`Time[]`），`paneView.update()` 內用 `timeScale().timeToCoordinate()` 即時轉 pixel x，縮放／resize／pan 後不跑位；範圍外的日期（座標為 null）略過。

- `ChartContainer` 建立圖表時 `candlestickSeries.attachPrimitive(primitive)`，`adjustmentDates` prop 變動時 `primitive.setTimes(...)`，卸載時 `detachPrimitive`。
- **為何不用 series markers**：原先用 `createSeriesMarkers` 把圓點貼在每根 K 棒最高價上方，與頭底分析的箭頭 marker、MA／布林等 overlay 指標擠在同一區、不易觀看。垂直線方向與指標線（多為橫向走勢）截然不同、一眼可辨，且不佔 K 棒上方空間。
- `verticalLinePrimitive.test.ts`：每日期一條全高線（`moveTo(x,0)`→`lineTo(x,height)`）、頂部標籤、範圍外略過、未 attach／detach 後不畫、`setTimes` 觸發 `requestUpdate`。

## 持久化與分享

還原狀態**會改變指標計算結果**，故同時存本機並隨分享連結傳遞，對方開連結才看得到相同的指標線。

- **localStorage**（`persistence.ts`）：`settingsSchema` 增 `useAdjusted: z.boolean().optional().default(false)`（append-only，舊 `settings:v1` 無此欄→預設 false，parse 不失敗）。
- **分享 URL**（`schema.ts` / `urlState.ts`）：`shareStateSchema` 同樣增 `useAdjusted`；精簡字串在尾端新增**第 6 欄** `a`——開啟時為 `1`，**關閉時整欄省略**（false 連結長度與舊版一致）。舊連結無第 6 欄→false，向前相容。
- **App 初值優先序**：`restored?.useAdjusted ?? initialSettings?.useAdjusted ?? false`（分享 → 本機 → 預設，與 symbol／prov 一致）；`exitPreview` 一併重設、`buildShareUrl` 帶入。

## 手動驗證紀錄（2026-07-24，沙盒 Chromium）

- 上游實測：對 Yahoo proxy 打帶 `events=div|split` 的 URL，`indicators.adjclose` 確實回傳；2330／2024 首根 close 593 vs adjClose 570.36（factor≈0.96），`detectAdjustmentDates` 抓到 **4 個除權息日**，與季配息（一年 4 次）一致。
- DOM 層：Yahoo 源時開關可勾選、切官方源即 `disabled` 並顯示提示；勾選後 `settings:v1.useAdjusted` 為 `true`；全程無 console 錯誤。
- **canvas 視覺（K 線抹平跳空、垂直線）無法在此沙盒截圖驗證**（Browser pane 為 hidden、canvas 不 compositing），繪製與換算邏輯改由單元測試覆蓋，見 [technical-debt.md](../project-planning/technical-debt.md)。

## 已知限制

- **僅 Yahoo 源**：官方源無還原資料，開關在官方源時 disabled。
- **成交量不還原**：見上，`volume` 維持原始值。
- **手繪趨勢線不隨開關重算**：線以 time/price 座標儲存，切換還原後價位位移，線會停在原價位、可能與 K 棒錯開；不自動清除（避免丟失使用者畫線）。見 [technical-debt.md](../project-planning/technical-debt.md)。
