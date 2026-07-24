import { describe, expect, it } from 'vitest';
import type { ISeriesApi, MouseEventParams, SeriesType } from 'lightweight-charts';
import { buildTooltipModel } from './tooltip';
import type { IndicatorTooltipRow } from './indicators/types';

/** 假 series：只需要 `priceFormatter().format()`，其餘 API 不碰。 */
function fakeSeries(format: (value: number) => string): ISeriesApi<SeriesType> {
  return { priceFormatter: () => ({ format }) } as unknown as ISeriesApi<SeriesType>;
}

const candlestickSeries = fakeSeries((v) => v.toFixed(1)) as ISeriesApi<'Candlestick'>;
const volumeSeries = fakeSeries((v) => String(v)) as ISeriesApi<'Histogram'>;

function makeParam(
  entries: Array<[ISeriesApi<SeriesType>, unknown]>,
  opts: { time?: unknown; point?: unknown } = {},
): MouseEventParams {
  return {
    time: 'time' in opts ? opts.time : '2026-03-04',
    point: 'point' in opts ? opts.point : { x: 100, y: 50 },
    seriesData: new Map(entries),
  } as unknown as MouseEventParams;
}

const candle = { open: 1895, high: 1910, low: 1865, close: 1865 };
const volume = { value: 84_647_010 };

describe('buildTooltipModel', () => {
  it('游標不在資料點上（缺 time）時回 null', () => {
    const param = makeParam([[candlestickSeries as ISeriesApi<SeriesType>, candle]], { time: undefined });
    expect(buildTooltipModel(param, { candlestickSeries, volumeSeries, indicatorRows: [] })).toBeNull();
  });

  it('缺 point 時回 null', () => {
    const param = makeParam([[candlestickSeries as ISeriesApi<SeriesType>, candle]], { point: undefined });
    expect(buildTooltipModel(param, { candlestickSeries, volumeSeries, indicatorRows: [] })).toBeNull();
  });

  it('OHLC 用中文 label、日期去掉連字號', () => {
    const param = makeParam([[candlestickSeries as ISeriesApi<SeriesType>, candle]]);
    const model = buildTooltipModel(param, { candlestickSeries, volumeSeries, indicatorRows: [] });

    expect(model?.date).toBe('20260304');
    expect(model?.rows).toEqual([
      { label: '開盤價', value: '1895.0' },
      { label: '最高價', value: '1910.0' },
      { label: '最低價', value: '1865.0' },
      { label: '收盤價', value: '1865.0' },
    ]);
  });

  it('成交量顯示完整千分位（非 K/M 縮寫）', () => {
    const param = makeParam([[volumeSeries as ISeriesApi<SeriesType>, volume]]);
    const model = buildTooltipModel(param, { candlestickSeries, volumeSeries, indicatorRows: [] });

    expect(model?.rows).toContainEqual({ label: '成交量', value: '84,647,010' });
  });

  it('指標列帶入名稱、值（各自精度）與線色', () => {
    const maSeries = fakeSeries((v) => v.toFixed(1));
    const indicatorRows: IndicatorTooltipRow[] = [{ label: 'MA20', color: '#2196f3', series: maSeries }];
    const param = makeParam([
      [candlestickSeries as ISeriesApi<SeriesType>, candle],
      [maSeries, { value: 1854.5 }],
    ]);

    const model = buildTooltipModel(param, { candlestickSeries, volumeSeries, indicatorRows });

    expect(model?.rows).toContainEqual({ label: 'MA20', value: '1854.5', color: '#2196f3' });
  });

  it('逐點自帶色（如 SAR 多空分色）優先於指標線色', () => {
    const sarSeries = fakeSeries((v) => v.toFixed(2));
    const indicatorRows: IndicatorTooltipRow[] = [{ label: 'SAR', color: '#000000', series: sarSeries }];
    const param = makeParam([[sarSeries, { value: 123, color: '#ff0000' }]]);

    const model = buildTooltipModel(param, { candlestickSeries, volumeSeries, indicatorRows });

    expect(model?.rows).toContainEqual({ label: 'SAR', value: '123.00', color: '#ff0000' });
  });

  it('該日無值的指標（seriesData 無此 series 或為空白資料）不出現', () => {
    const emptySeries = fakeSeries((v) => String(v));
    const indicatorRows: IndicatorTooltipRow[] = [{ label: 'RSI14', color: '#2196f3', series: emptySeries }];
    // emptySeries 不在 seriesData 中（該日尚無值）。
    const param = makeParam([[candlestickSeries as ISeriesApi<SeriesType>, candle]]);

    const model = buildTooltipModel(param, { candlestickSeries, volumeSeries, indicatorRows });

    expect(model?.rows.some((row) => row.label === 'RSI14')).toBe(false);
  });

  it('所有 series 皆無值時回 null（如空白區）', () => {
    const param = makeParam([]);
    expect(buildTooltipModel(param, { candlestickSeries, volumeSeries, indicatorRows: [] })).toBeNull();
  });
});
