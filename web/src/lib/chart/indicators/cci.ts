import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { DEFAULT_LINE_COLOR } from '../colors';
import { sma } from './movingAverage';
import { createReferenceLines } from './referenceLines';
import { registerIndicator } from './registry';
import {
  numberParam,
  stringParam,
  type IndicatorDefinition,
  type IndicatorMountHandle,
  type IndicatorParamValues,
  type PaneIndexAllocator,
} from './types';

const DEFAULT_PERIOD = 20;

/** Lambert 原始定義的常數，讓約 70~80% 的值落在 ±100 之間。 */
const LAMBERT_CONSTANT = 0.015;

const LEVELS = [-100, 100];

export interface CciPoint {
  time: string;
  value: number;
}

/**
 * CCI =（典型價 − 典型價 SMA）/（0.015 × 平均絕對偏差）。
 * 典型價 TP =（高 + 低 + 收）/ 3；平均絕對偏差是視窗內 |TP − SMA| 的平均（不是標準差）。
 * 視窗內完全無偏差（平均絕對偏差為 0）時輸出 0。資料不足 period 天的時間點不輸出。
 */
function computeCci(bars: OhlcvBar[], params: IndicatorParamValues): CciPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const typicalPrices = bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
  const means = sma(typicalPrices, period);

  return means.map((mean, i) => {
    const barIndex = period - 1 + i;
    const window = typicalPrices.slice(barIndex - period + 1, barIndex + 1);
    const meanDeviation = window.reduce((acc, value) => acc + Math.abs(value - mean), 0) / period;
    const value =
      meanDeviation === 0 ? 0 : (typicalPrices[barIndex] - mean) / (LAMBERT_CONSTANT * meanDeviation);

    return { time: bars[barIndex].time, value };
  });
}

function toLineData(points: CciPoint[]): LineData[] {
  return points.map((point) => ({ time: point.time, value: point.value }));
}

function mount(
  chart: IChartApi,
  paneIndexAllocator: PaneIndexAllocator,
  bars: OhlcvBar[],
  params: IndicatorParamValues,
): IndicatorMountHandle {
  const paneIndex = paneIndexAllocator.allocate();
  const series: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    { color: stringParam(params, 'color', DEFAULT_LINE_COLOR), lineWidth: 1 },
    paneIndex,
  );
  const referenceLines = createReferenceLines(series, LEVELS);

  const setAll = (currentBars: OhlcvBar[], currentParams: IndicatorParamValues) => {
    series.applyOptions({ color: stringParam(currentParams, 'color', DEFAULT_LINE_COLOR) });
    series.setData(toLineData(computeCci(currentBars, currentParams)));
  };

  setAll(bars, params);

  return {
    update(nextBars, nextParams) {
      setAll(nextBars, nextParams);
    },
    dispose() {
      referenceLines.dispose();
      chart.removeSeries(series);
      paneIndexAllocator.release(paneIndex);
    },
  };
}

export const CciIndicator: IndicatorDefinition<CciPoint[]> = {
  id: 'cci',
  urlCode: 'cc',
  label: '順勢指標（CCI）',
  placement: 'separate-pane',
  paramsSchema: [
    { key: 'period', label: '週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'color', label: '線色', type: 'color', default: DEFAULT_LINE_COLOR },
  ],
  compute: computeCci,
  mount,
};

registerIndicator(CciIndicator);
