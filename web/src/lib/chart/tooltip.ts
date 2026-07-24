import type { ISeriesApi, MouseEventParams, Time } from 'lightweight-charts';
import { PRICE_SOURCE_OPTIONS } from './indicators/priceSource';
import type { IndicatorTooltipRow } from './indicators/types';

/** tooltip 的一列：名稱、格式化後的值字串、選用的色點顏色。 */
export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** tooltip 的完整資料模型；純資料，渲染與定位由呼叫端負責。 */
export interface TooltipModel {
  date: string;
  rows: TooltipRow[];
}

export interface TooltipSources {
  candlestickSeries: ISeriesApi<'Candlestick'>;
  volumeSeries: ISeriesApi<'Histogram'>;
  /** 依圖例順序攤平的所有指標線（頭底分析等無逐日值者不在其中）。 */
  indicatorRows: IndicatorTooltipRow[];
}

/** OHLC 中文名稱沿用「計算來源」選單的 label，避免重複定義（收盤價/開盤價/最高價/最低價/成交量）。 */
function priceLabel(source: string): string {
  return PRICE_SOURCE_OPTIONS.find((option) => option.value === source)?.label ?? source;
}

/** 日線 time 為 'YYYY-MM-DD' 字串，格式成附圖的 'YYYYMMDD'；非字串型（timestamp 等）退回原字串。 */
function formatDate(time: Time): string {
  return typeof time === 'string' ? time.replace(/-/g, '') : String(time);
}

/** 成交量顯示完整千分位（附圖 84,647,010），不用 lightweight-charts volume 格式的 K/M 縮寫。 */
function formatVolume(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/**
 * 從 crosshair 事件組出 tooltip 資料模型：日期、K 線 OHLC（中文）、成交量、各指標當日值。
 * 值一律取自 `param.seriesData`（lightweight-charts 已算好、已對齊各自座標軸精度），不重算。
 * 游標不在資料點上（`time`／`point` 缺）時回 `null`，呼叫端據此隱藏。
 */
export function buildTooltipModel(
  param: MouseEventParams,
  { candlestickSeries, volumeSeries, indicatorRows }: TooltipSources,
): TooltipModel | null {
  if (param.time === undefined || param.point === undefined) return null;

  const rows: TooltipRow[] = [];

  const candle = param.seriesData.get(candlestickSeries);
  if (candle && 'open' in candle) {
    const price = candlestickSeries.priceFormatter();
    rows.push(
      { label: priceLabel('open'), value: price.format(candle.open) },
      { label: priceLabel('high'), value: price.format(candle.high) },
      { label: priceLabel('low'), value: price.format(candle.low) },
      { label: priceLabel('close'), value: price.format(candle.close) },
    );
  }

  const volume = param.seriesData.get(volumeSeries);
  if (volume && 'value' in volume) {
    rows.push({ label: priceLabel('volume'), value: formatVolume(volume.value) });
  }

  for (const row of indicatorRows) {
    const data = param.seriesData.get(row.series);
    if (!data || !('value' in data)) continue;
    rows.push({
      label: row.label,
      value: row.series.priceFormatter().format(data.value),
      // 逐點自帶色（如 SAR 多空分色）優先，否則用該指標線目前的線色。
      color: ('color' in data && typeof data.color === 'string' && data.color) || row.color,
    });
  }

  if (rows.length === 0) return null;

  return { date: formatDate(param.time), rows };
}
