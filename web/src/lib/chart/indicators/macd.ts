import {
  HistogramSeries,
  LineSeries,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
} from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { UP_COLOR, DOWN_COLOR, DEFAULT_LINE_COLOR } from '../colors';
import { registerIndicator } from './registry';
import {
  numberParam,
  stringParam,
  type IndicatorDefinition,
  type IndicatorMountHandle,
  type IndicatorParamValues,
  type PaneIndexAllocator,
} from './types';

const DEFAULT_FAST_PERIOD = 12;
const DEFAULT_SLOW_PERIOD = 26;
const DEFAULT_SIGNAL_PERIOD = 9;

/** DIF 沿用預設藍線，DEA 沿用原本的橘線，保持既有外觀。 */
const DEFAULT_DIF_COLOR = DEFAULT_LINE_COLOR;
const DEFAULT_DEA_COLOR = '#ff9800';

export interface MacdPoint {
  time: string;
  dif: number;
  dea: number;
  histogram: number;
}

/** 對 values 計算週期為 period 的 EMA，種子為前 period 筆的 SMA；回傳陣列從 values[period-1] 對齊開始，長度為 values.length-period+1（資料不足時回傳空陣列）。 */
function computeEmaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const result: number[] = [];

  let previous = values.slice(0, period).reduce((acc, value) => acc + value, 0) / period;
  result.push(previous);

  for (let i = period; i < values.length; i += 1) {
    previous = values[i] * multiplier + previous * (1 - multiplier);
    result.push(previous);
  }

  return result;
}

/**
 * 計算 MACD：DIF = EMA(fast) - EMA(slow)，DEA = EMA(DIF, signal)，histogram = DIF - DEA。
 * 資料不足以算出完整 DIF/DEA/histogram 的時間點不輸出（與 MA/布林通道一致）。
 */
function computeMacd(bars: OhlcvBar[], params: IndicatorParamValues): MacdPoint[] {
  const fastPeriod = Math.max(1, Math.round(numberParam(params, 'fastPeriod', DEFAULT_FAST_PERIOD)));
  const slowPeriod = Math.max(1, Math.round(numberParam(params, 'slowPeriod', DEFAULT_SLOW_PERIOD)));
  const signalPeriod = Math.max(1, Math.round(numberParam(params, 'signalPeriod', DEFAULT_SIGNAL_PERIOD)));

  const closes = bars.map((bar) => bar.close);
  const fastEma = computeEmaSeries(closes, fastPeriod);
  const slowEma = computeEmaSeries(closes, slowPeriod);
  if (slowEma.length === 0) return [];

  // fastEma[0] 對齊 bars[fastPeriod-1]，slowEma[0] 對齊 bars[slowPeriod-1]；offset 換算成 fastEma 的索引。
  const offset = slowPeriod - fastPeriod;
  const difValues: number[] = [];
  for (let i = 0; i < slowEma.length; i += 1) {
    const fastIndex = i + offset;
    if (fastIndex < 0 || fastIndex >= fastEma.length) continue;
    difValues.push(fastEma[fastIndex] - slowEma[i]);
  }

  const deaValues = computeEmaSeries(difValues, signalPeriod);
  const difStartBarIndex = slowPeriod - 1;
  const points: MacdPoint[] = [];

  for (let i = 0; i < deaValues.length; i += 1) {
    const difIndex = i + signalPeriod - 1;
    const dif = difValues[difIndex];
    const dea = deaValues[i];
    const barIndex = difStartBarIndex + difIndex;
    points.push({ time: bars[barIndex].time, dif, dea, histogram: dif - dea });
  }

  return points;
}

function toLineData(points: MacdPoint[], key: 'dif' | 'dea'): LineData[] {
  return points.map((point) => ({ time: point.time, value: point[key] }));
}

function toHistogramData(points: MacdPoint[]): HistogramData[] {
  return points.map((point) => ({
    time: point.time,
    value: point.histogram,
    color: point.histogram >= 0 ? UP_COLOR : DOWN_COLOR,
  }));
}

function mount(
  chart: IChartApi,
  paneIndexAllocator: PaneIndexAllocator,
  bars: OhlcvBar[],
  params: IndicatorParamValues,
): IndicatorMountHandle {
  const paneIndex = paneIndexAllocator.allocate();
  const difSeries: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    { color: stringParam(params, 'difColor', DEFAULT_DIF_COLOR), lineWidth: 1 },
    paneIndex,
  );
  const deaSeries: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    { color: stringParam(params, 'deaColor', DEFAULT_DEA_COLOR), lineWidth: 1 },
    paneIndex,
  );
  const histogramSeries: ISeriesApi<'Histogram'> = chart.addSeries(HistogramSeries, {}, paneIndex);

  const setAll = (currentBars: OhlcvBar[], currentParams: IndicatorParamValues) => {
    const points = computeMacd(currentBars, currentParams);
    difSeries.applyOptions({ color: stringParam(currentParams, 'difColor', DEFAULT_DIF_COLOR) });
    deaSeries.applyOptions({ color: stringParam(currentParams, 'deaColor', DEFAULT_DEA_COLOR) });
    difSeries.setData(toLineData(points, 'dif'));
    deaSeries.setData(toLineData(points, 'dea'));
    histogramSeries.setData(toHistogramData(points));
  };

  setAll(bars, params);

  return {
    update(nextBars, nextParams) {
      setAll(nextBars, nextParams);
    },
    dispose() {
      chart.removeSeries(difSeries);
      chart.removeSeries(deaSeries);
      chart.removeSeries(histogramSeries);
      paneIndexAllocator.release(paneIndex);
    },
  };
}

export const MacdIndicator: IndicatorDefinition<MacdPoint[]> = {
  id: 'macd',
  urlCode: 'md',
  label: 'MACD',
  placement: 'separate-pane',
  paramsSchema: [
    { key: 'fastPeriod', label: '快線週期(EMA)', default: DEFAULT_FAST_PERIOD, min: 1, max: 200, step: 1 },
    { key: 'slowPeriod', label: '慢線週期(EMA)', default: DEFAULT_SLOW_PERIOD, min: 1, max: 400, step: 1 },
    { key: 'signalPeriod', label: '訊號線週期(EMA)', default: DEFAULT_SIGNAL_PERIOD, min: 1, max: 100, step: 1 },
    { key: 'difColor', label: 'DIF 線色', type: 'color', default: DEFAULT_DIF_COLOR },
    { key: 'deaColor', label: 'DEA 線色', type: 'color', default: DEFAULT_DEA_COLOR },
  ],
  compute: computeMacd,
  mount,
};

registerIndicator(MacdIndicator);
