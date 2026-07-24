import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { DEFAULT_LINE_COLOR } from '../colors';
import { sma } from './movingAverage';
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
const DEFAULT_STD_DEV_MULTIPLIER = 2;

/** 三條軌線的色值參數 key，預設沿用 lightweight-charts 預設藍線以保持既有外觀。 */
const BANDS = [
  { key: 'upper', colorParam: 'upperColor' },
  { key: 'middle', colorParam: 'middleColor' },
  { key: 'lower', colorParam: 'lowerColor' },
] as const;

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
  const means = sma(bars.map((bar) => bar.close), period);

  return means.map((mean, i) => {
    const barIndex = period - 1 + i;
    const window = bars.slice(barIndex - period + 1, barIndex + 1);
    const variance = window.reduce((acc, bar) => acc + (bar.close - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      time: bars[barIndex].time,
      upper: mean + multiplier * stdDev,
      middle: mean,
      lower: mean - multiplier * stdDev,
    };
  });
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
  const bands = BANDS.map((band) => ({
    ...band,
    series: chart.addSeries(LineSeries, {}, 0) as ISeriesApi<'Line'>,
  }));

  const setAll = (currentBars: OhlcvBar[], currentParams: IndicatorParamValues) => {
    const points = computeBollinger(currentBars, currentParams);
    for (const band of bands) {
      band.series.applyOptions({ color: stringParam(currentParams, band.colorParam, DEFAULT_LINE_COLOR) });
      band.series.setData(toLineData(points, band.key));
    }
  };

  setAll(bars, params);

  return {
    update(nextBars, nextParams) {
      setAll(nextBars, nextParams);
    },
    dispose() {
      for (const band of bands) {
        chart.removeSeries(band.series);
      }
    },
  };
}

export const BollingerIndicator: IndicatorDefinition<BollingerPoint[]> = {
  id: 'bollinger',
  urlCode: 'bb',
  label: '布林通道（Bollinger Bands）',
  placement: 'overlay',
  paramsSchema: [
    { key: 'period', label: '週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'stdDevMultiplier', label: '標準差倍數', default: DEFAULT_STD_DEV_MULTIPLIER, min: 0.5, max: 5, step: 0.5 },
    { key: 'upperColor', label: '上軌線色', type: 'color', default: DEFAULT_LINE_COLOR },
    { key: 'middleColor', label: '中軌線色', type: 'color', default: DEFAULT_LINE_COLOR },
    { key: 'lowerColor', label: '下軌線色', type: 'color', default: DEFAULT_LINE_COLOR },
  ],
  compute: computeBollinger,
  mount,
};

registerIndicator(BollingerIndicator);
