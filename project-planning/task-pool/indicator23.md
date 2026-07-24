# indicator23 — 頭底分析（自訂分析方式）

## 說明

使用者指定的自訂分析方式，新增 `web/src/lib/chart/indicators/headBottom.ts`：`id: 'headBottom'`、`urlCode: 'hb'`、`placement: 'overlay'`。

規則：以可調週期的均線為基準（預設 5 日），**收盤價**每次穿越均線就切出一個區間；每次穿越時回頭看**上一個區間**——向上突破取該區間**最低價的最小值**當「底」，向下突破取**最高價的最大值**當「頭」——再把頭底頭底依序連成折線。

- 參數：`period`（均線週期，預設 5，1–240）、`color`（連線色，預設 `#ab47bc` 紫，與既有藍/橘/黃/紅綠區隔）。
- 判定細節（皆為刻意選擇）：
  - `close === ma` 視為「不在上方」，避免貼著均線走時同一根反覆觸發。
  - 區間是半開的 `[上一次突破的位置, 這次突破的前一根]`，新的突破 K 棒屬於下一個區間；第一次突破的區間起點用 `period - 1`（均線第一個有值的位置）。
  - 極值同值時取較早的一根。
  - **最後一次突破之後的區間不輸出任何點**（尚未被下一次突破確認，極值會隨新 K 棒變動）。
- `mount()`：主圖 pane 0 掛一條 `LineSeries` 並**只餵樞紐點**——lightweight-charts 會自動把相鄰資料點連成直線，於是頭→底→頭→底 自然成為折線，不需要自訂 primitive。另用 `createSeriesMarkers()` 標「頭」（`aboveBar` + `arrowDown`）／「底」（`belowBar` + `arrowUp`）；`dispose()` 先 `markers.detach()` 再移除 series。標記內容由匯出的純函式 `toHeadBottomMarkers()` 產生，測試不必碰 markers plugin。
- 折線只在樞紐點有資料，故關掉 `lastValueVisible` 與 `priceLineVisible`。

## 依賴

indicator12

## 驗收方式

1. 以手算基準序列（period=3）逐點比對輸出的 `kind`/`time`/`price`，且結果為 底/頭/底 交替。
2. 尾端補上未再穿越均線的 K 棒時輸出不變；直到下一次穿越發生才多出一個樞紐點。
3. 極值同值取較早一根；從未穿越均線、全平盤、資料不足 period 天三種情況皆回傳空陣列。
4. `mount()` 只建立一條主圖 series（不佔用 separate pane），markers plugin 在 mount 掛上、dispose 卸下。
5. 分享連結以 `hb` 短代碼編解碼（`hb:10` 表示週期 10）。
