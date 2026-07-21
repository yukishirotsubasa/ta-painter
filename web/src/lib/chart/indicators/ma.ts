import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { registerIndicator } from './registry';
import type { IndicatorDefinition, IndicatorMountHandle, IndicatorParamValues, PaneIndexAllocator } from './types';

const DEFAULT_PERIOD = 20;

export interface MaPoint {
  time: string;
  value: number;
}

/** 對 close 計算週期為 params.period 的簡單移動平均；資料不足 period 天的時間點不輸出（無值可算）。 */
function computeMa(bars: OhlcvBar[], params: IndicatorParamValues): MaPoint[] {
  const period = Math.max(1, Math.round(params.period ?? DEFAULT_PERIOD));
  const points: MaPoint[] = [];

  for (let i = period - 1; i < bars.length; i += 1) {
    const window = bars.slice(i - period + 1, i + 1);
    const sum = window.reduce((acc, bar) => acc + bar.close, 0);
    points.push({ time: bars[i].time, value: sum / period });
  }

  return points;
}

function toLineData(points: MaPoint[]): LineData[] {
  return points.map((point) => ({ time: point.time, value: point.value }));
}

function mount(
  chart: IChartApi,
  _paneIndexAllocator: PaneIndexAllocator,
  bars: OhlcvBar[],
  params: IndicatorParamValues,
): IndicatorMountHandle {
  const series: ISeriesApi<'Line'> = chart.addSeries(LineSeries, {}, 0);
  series.setData(toLineData(computeMa(bars, params)));

  return {
    update(nextBars, nextParams) {
      series.setData(toLineData(computeMa(nextBars, nextParams)));
    },
    dispose() {
      chart.removeSeries(series);
    },
  };
}

export const MaIndicator: IndicatorDefinition<MaPoint[]> = {
  id: 'ma',
  label: '移動平均線（MA）',
  placement: 'overlay',
  paramsSchema: [{ key: 'period', label: '週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 }],
  compute: computeMa,
  mount,
};

registerIndicator(MaIndicator);
