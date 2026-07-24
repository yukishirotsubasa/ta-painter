import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { DEFAULT_LINE_COLOR } from '../colors';
import { rollingMax, rollingMin } from './movingAverage';
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

const DEFAULT_PERIOD = 14;

/** 威廉指標的值域是 −100 ~ 0，超買／超賣線因此在 −20 / −80。 */
const LEVELS = [-20, -80];

/** 視窗內高低相同（無波動）時沒有相對位置可言，取值域中點。 */
const NEUTRAL_VALUE = -50;

export interface WilliamsPoint {
  time: string;
  value: number;
}

/**
 * 威廉指標 %R =（n 日最高 − 收盤）/（n 日最高 − n 日最低）× −100，值域 −100（最弱）~ 0（最強）。
 * 與 KD 的 RSV 互為鏡像（%R = RSV − 100），差別在 %R 不做平滑。
 * 資料不足 period 天的時間點不輸出。
 */
function computeWilliams(bars: OhlcvBar[], params: IndicatorParamValues): WilliamsPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const highs = rollingMax(bars.map((bar) => bar.high), period);
  const lows = rollingMin(bars.map((bar) => bar.low), period);

  return highs.map((high, i) => {
    const barIndex = period - 1 + i;
    const span = high - lows[i];
    const value = span === 0 ? NEUTRAL_VALUE : ((high - bars[barIndex].close) / span) * -100;

    return { time: bars[barIndex].time, value };
  });
}

function toLineData(points: WilliamsPoint[]): LineData[] {
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
    series.setData(toLineData(computeWilliams(currentBars, currentParams)));
  };

  setAll(bars, params);

  let latestParams = params;

  return {
    update(nextBars, nextParams) {
      setAll(nextBars, nextParams);
      latestParams = nextParams;
    },
    dispose() {
      referenceLines.dispose();
      chart.removeSeries(series);
      paneIndexAllocator.release(paneIndex);
    },
    tooltipRows() {
      const period = Math.max(1, Math.round(numberParam(latestParams, 'period', DEFAULT_PERIOD)));
      return [{ label: `%R${period}`, color: series.options().color, series }];
    },
  };
}

export const WilliamsIndicator: IndicatorDefinition<WilliamsPoint[]> = {
  id: 'williams',
  urlCode: 'wr',
  label: '威廉指標（%R）',
  placement: 'separate-pane',
  paramsSchema: [
    { key: 'period', label: '週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'color', label: '線色', type: 'color', default: DEFAULT_LINE_COLOR },
  ],
  compute: computeWilliams,
  mount,
};

registerIndicator(WilliamsIndicator);
