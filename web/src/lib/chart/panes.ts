/**
 * 圖表保留 pane 佈局的單一來源（indicator9）。
 *
 * pane index 由 `ChartContainer` 建立 series 的順序決定：先 `CandlestickSeries`（pane 0），
 * 再 `HistogramSeries` 量能（pane 1）。指標若需要 separate pane，一律從 `RESERVED_PANE_COUNT` 起算。
 * 改動建立順序時務必同步此檔。
 */

/** K 線主圖 pane。 */
export const PRICE_PANE_INDEX = 0;

/** 量能柱 pane；source=volume 的指標掛在此以共用成交量 scale。 */
export const VOLUME_PANE_INDEX = 1;

/** 保留給主圖與量能的 pane 數量，separate-pane 指標的起始 index。 */
export const RESERVED_PANE_COUNT = 2;
