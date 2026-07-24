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

/**
 * 圖表座標軸文字色，對齊 `index.css` 的 `--text`（整站固定深色，chart4）。
 * 圖表 canvas 讀不到 CSS 變數，只能在此以常數同步維護。
 */
export const CHART_TEXT_COLOR = '#9ca3af';

/** 圖表格線色，對齊 `index.css` 的 `--border`（同上，需與 CSS 一起改）。 */
export const CHART_GRID_COLOR = '#2e303a';

/** 手繪趨勢線的預設顏色（drawing7），畫線工具列選色器的初始值與新線 fallback 皆用它。 */
export const DEFAULT_DRAWING_LINE_COLOR = '#f5a623';

/**
 * 震盪指標水平參考線的顏色（indicator12）：RSI 30/70、KD 20/80、CCI ±100、%R −20/−80、BIAS/ROC 0 軸。
 * 刻意比格線亮一點但比指標線暗，讓它讀得到又不搶戲；不開放參數調整。
 */
export const REFERENCE_LINE_COLOR = '#5a5d6b';

/** 除權息／分割日垂直標記線色（半透明金色），與漲跌紅綠、指標藍紫、手繪橙都區隔得開。 */
export const ADJUSTMENT_LINE_COLOR = 'rgba(250, 204, 21, 0.65)';
