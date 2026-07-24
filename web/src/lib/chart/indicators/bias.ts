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

const DEFAULT_PERIOD = 10;

/** 乖離率的多空分界就是 0 軸。 */
const LEVELS = [0];

export interface BiasPoint {
  time: string;
  value: number;
}

/**
 * 乖離率 BIAS =（收盤 − n 日均線）/ n 日均線 × 100，衡量股價偏離均線的百分比。
 * 均線為 0（不會出現在真實股價，僅防呆）時輸出 0。資料不足 period 天的時間點不輸出。
 */
function computeBias(bars: OhlcvBar[], params: IndicatorParamValues): BiasPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const means = sma(bars.map((bar) => bar.close), period);

  return means.map((mean, i) => {
    const barIndex = period - 1 + i;
    const value = mean === 0 ? 0 : ((bars[barIndex].close - mean) / mean) * 100;
    return { time: bars[barIndex].time, value };
  });
}

function toLineData(points: BiasPoint[]): LineData[] {
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
    series.setData(toLineData(computeBias(currentBars, currentParams)));
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

export const BiasIndicator: IndicatorDefinition<BiasPoint[]> = {
  id: 'bias',
  urlCode: 'bi',
  label: '乖離率（BIAS）',
  placement: 'separate-pane',
  paramsSchema: [
    { key: 'period', label: '均線週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'color', label: '線色', type: 'color', default: DEFAULT_LINE_COLOR },
  ],
  compute: computeBias,
  mount,
};

registerIndicator(BiasIndicator);
