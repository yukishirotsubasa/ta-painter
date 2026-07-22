import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { registerIndicator } from './registry';
import {
  numberParam,
  type IndicatorDefinition,
  type IndicatorMountHandle,
  type IndicatorParamValues,
  type PaneIndexAllocator,
} from './types';

const DEFAULT_PERIOD = 20;
const DEFAULT_STD_DEV_MULTIPLIER = 2;

export interface BollingerPoint {
  time: string;
  upper: number;
  middle: number;
  lower: number;
}

/**
 * 對 close 計算週期為 params.period 的 SMA（中軌）± params.stdDevMultiplier 倍母體標準差（上/下軌）；
 * 資料不足 period 天的時間點不輸出（無值可算），與 MA 指標一致。
 */
function computeBollinger(bars: OhlcvBar[], params: IndicatorParamValues): BollingerPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const multiplier = numberParam(params, 'stdDevMultiplier', DEFAULT_STD_DEV_MULTIPLIER);
  const points: BollingerPoint[] = [];

  for (let i = period - 1; i < bars.length; i += 1) {
    const window = bars.slice(i - period + 1, i + 1);
    const mean = window.reduce((acc, bar) => acc + bar.close, 0) / period;
    const variance = window.reduce((acc, bar) => acc + (bar.close - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);

    points.push({
      time: bars[i].time,
      upper: mean + multiplier * stdDev,
      middle: mean,
      lower: mean - multiplier * stdDev,
    });
  }

  return points;
}

function toLineData(points: BollingerPoint[], key: 'upper' | 'middle' | 'lower'): LineData[] {
  return points.map((point) => ({ time: point.time, value: point[key] }));
}

function mount(
  chart: IChartApi,
  _paneIndexAllocator: PaneIndexAllocator,
  bars: OhlcvBar[],
  params: IndicatorParamValues,
): IndicatorMountHandle {
  const upperSeries: ISeriesApi<'Line'> = chart.addSeries(LineSeries, {}, 0);
  const middleSeries: ISeriesApi<'Line'> = chart.addSeries(LineSeries, {}, 0);
  const lowerSeries: ISeriesApi<'Line'> = chart.addSeries(LineSeries, {}, 0);

  const setAll = (currentBars: OhlcvBar[], currentParams: IndicatorParamValues) => {
    const points = computeBollinger(currentBars, currentParams);
    upperSeries.setData(toLineData(points, 'upper'));
    middleSeries.setData(toLineData(points, 'middle'));
    lowerSeries.setData(toLineData(points, 'lower'));
  };

  setAll(bars, params);

  return {
    update(nextBars, nextParams) {
      setAll(nextBars, nextParams);
    },
    dispose() {
      chart.removeSeries(upperSeries);
      chart.removeSeries(middleSeries);
      chart.removeSeries(lowerSeries);
    },
  };
}

export const BollingerIndicator: IndicatorDefinition<BollingerPoint[]> = {
  id: 'bollinger',
  label: '布林通道（Bollinger Bands）',
  placement: 'overlay',
  paramsSchema: [
    { key: 'period', label: '週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'stdDevMultiplier', label: '標準差倍數', default: DEFAULT_STD_DEV_MULTIPLIER, min: 0.5, max: 5, step: 0.5 },
  ],
  compute: computeBollinger,
  mount,
};

registerIndicator(BollingerIndicator);
