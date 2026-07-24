# chart6 — 滑鼠 tooltip（當日價格＋指標資訊）

## 說明

滑鼠指到某一天時，於圖表內彈出資訊框，顯示該日日期、K 線 OHLC（中文「開盤價／最高價／最低價／收盤價」）、成交量與**所有指標的當日值**。lightweight-charts v5 沒有 tooltip formatter API，故自建命令式 HTML overlay，靠 `chart.subscribeCrosshairMove(param)` 取值與定位。

- **指標架構擴充**（`web/src/lib/chart/indicators/types.ts`）：新增 `IndicatorTooltipRow`（`{ label, color, series }`）與 `IndicatorMountHandle` 的**選用** `tooltipRows?()`。指標的 series 參考原本封在 handle 內、外部拿不到；改由每個 handle 交出自己的 series＋顯示名稱＋線色，tooltip 端再以 `param.seriesData.get(series)` 取 lightweight-charts 已算好、已對齊各自座標軸精度的當日值（值不重算）。
- **各指標 `tooltipRows()`**：14 個有逐日值的指標實作（MA/EMA/RSI/ATR/CCI/%R/BIAS/ROC 帶週期標籤如 `MA20` 以區分多實例；Bollinger 三軌、MACD `DIF/DEA/MACD柱`、KD `K/D`、DMI `+DI/−DI/ADX` 逐線；OBV/SAR 各一列）。label 用 `latestParams`（`update()` 時更新）反映當前參數。**頭底分析刻意不實作**——它是稀疏樞紐點＋箭頭 markers，無逐日值。線色取 `series.options().color`（永遠反映使用者當下線色）。
- **純函式 `buildTooltipModel()`**（新增 `web/src/lib/chart/tooltip.ts`）：從 crosshair `param` 組出 `TooltipModel`（`{ date, rows }`）。OHLC 中文 label 沿用 `priceSource.ts` 的 `PRICE_SOURCE_OPTIONS`（收盤價/開盤價/最高價/最低價/成交量），避免重複定義；成交量走完整千分位（`toLocaleString('en-US')`，非 lightweight-charts volume 格式的 K/M 縮寫）；OHLC 與指標值用各自 series 的 `priceFormatter().format()`；逐點自帶色（SAR 多空、MACD 柱漲跌）優先於指標線色。`time`／`point` 缺或全無值時回 `null`。
- **接線＋overlay**（`web/src/components/chart/ChartContainer.tsx`＋`ChartContainer.css`）：`indicatorsRef` 每次 render 同步最新指標清單（訂閱只建一次，避免閉包抓舊值）；mount 時建 `.chart-tooltip` div（`pointer-events:none`，不擋畫線與 crosshair）並 `subscribeCrosshairMove`，依圖例順序攤平各 handle 的 `tooltipRows?.()`、`buildTooltipModel` 後以 DOM 節點（非 innerHTML，天然免跳脫）渲染並夾在容器內定位；cleanup 內 `unsubscribeCrosshairMove` 並移除 div。白框樣式（白底深字、色點、`z-index:3`、`tabular-nums`）。

## 依賴

indicator12（`priceSource.ts` 的 `PRICE_SOURCE_OPTIONS`）、indicator14–23（各指標 `mount()`）

## 驗收方式

1. 滑鼠移到某日出現白框，含日期、開盤價/最高價/最低價/收盤價、成交量（千分位）、各指標值（含正確名稱與色點）；移出圖表白框隱藏；改指標線色色點跟著變。
2. `buildTooltipModel` 單元測試（`tooltip.test.ts`，8 例）：缺 time／point 回 null、OHLC 中文 label＋日期去連字號、成交量千分位、指標列名稱／各自精度值／線色、逐點自帶色優先、該日無值指標不出現、全無值回 null。
3. 擴充 `IndicatorMountHandle`（新增選用 `tooltipRows?()`）不破壞既有指標與分享編解碼測試。
4. typecheck／lint／test 全綠。

## 備註

crosshair→tooltip 的 React 接線與 lightweight-charts 內部 crosshair 觸發，在 sandbox 的 Browser pane 無法驗證（canvas 不 compositing、合成 mousemove 不觸發 `subscribeCrosshairMove`），已記於 `technical-debt.md`；白框 CSS 呈現以 computed style 確認，實際 hover 效果需本機 `npm run dev` 肉眼複測。
