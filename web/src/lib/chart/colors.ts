/**
 * 圖表共用色票：漲跌色與預設線色集中於此，供 K 線量能柱、MACD histogram 與各指標線共用，
 * 避免 ChartContainer 與指標檔各自重複定義相同色值（indicator8）。
 */

/** 對齊 lightweight-charts CandlestickSeries 的預設漲色（量能柱、MACD histogram 共用）。 */
export const UP_COLOR = '#26a69a';

/** 對齊 lightweight-charts CandlestickSeries 的預設跌色（量能柱、MACD histogram 共用）。 */
export const DOWN_COLOR = '#ef5350';

/** lightweight-charts LineSeries 的預設線色，作為各指標線色參數的預設值。 */
export const DEFAULT_LINE_COLOR = '#2196f3';
