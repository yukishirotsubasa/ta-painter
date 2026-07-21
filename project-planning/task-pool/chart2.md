# chart2 — 量能子 Pane

## 說明

在 chart1 基礎上加入 `HistogramSeries` 作為成交量圖，指定 `paneIndex=1`（獨立子 pane），設定 `priceFormat: { type: 'volume' }`，並用 `chart.panes()[1].setHeight(120)` 調整子 pane 高度比例。

## 依賴

chart1

## 驗收方式

1. K 線圖下方顯示成交量柱狀圖，兩個 pane 高度比例合理（量能 pane 較矮）。
2. 抽查幾天的量能柱高度對應數值，與官方成交量數字比對一致。
3. 十字準星（crosshair）移動到某天時，K 線 pane 與量能 pane 的資訊連動正確對應同一天。
