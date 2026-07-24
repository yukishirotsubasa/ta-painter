import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { DEFAULT_LINE_COLOR } from '../colors';
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

const DEFAULT_PERIOD = 12;

/** 動能的多空分界就是 0 軸。 */
const LEVELS = [0];

export interface RocPoint {
  time: string;
  value: number;
}

/**
 * 動能指標 ROC =（今收 − n 日前收）/ n 日前收 × 100，也就是 n 日報酬率。
 * n 日前收盤為 0（不會出現在真實股價，僅防呆）時輸出 0。前 period 根沒有比較基準，不輸出。
 */
function computeRoc(bars: OhlcvBar[], params: IndicatorParamValues): RocPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const points: RocPoint[] = [];

  for (let i = period; i < bars.length; i += 1) {
    const base = bars[i - period].close;
    const value = base === 0 ? 0 : ((bars[i].close - base) / base) * 100;
    points.push({ time: bars[i].time, value });
  }

  return points;
}

function toLineData(points: RocPoint[]): LineData[] {
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
    series.setData(toLineData(computeRoc(currentBars, currentParams)));
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

export const RocIndicator: IndicatorDefinition<RocPoint[]> = {
  id: 'roc',
  urlCode: 'rc',
  label: '動能指標（ROC）',
  placement: 'separate-pane',
  paramsSchema: [
    { key: 'period', label: '週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'color', label: '線色', type: 'color', default: DEFAULT_LINE_COLOR },
  ],
  compute: computeRoc,
  mount,
};

registerIndicator(RocIndicator);
