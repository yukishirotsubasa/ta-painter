import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { DEFAULT_LINE_COLOR } from '../colors';
import { registerIndicator } from './registry';
import {
  stringParam,
  type IndicatorDefinition,
  type IndicatorMountHandle,
  type IndicatorParamValues,
  type PaneIndexAllocator,
} from './types';

export interface ObvPoint {
  time: string;
  value: number;
}

/**
 * 能量潮 OBV：收盤價較前一日上漲則累加當日成交量、下跌則扣除、持平則不變，第一根從 0 起算。
 * OBV 沒有週期參數，看的是累積曲線與股價的背離。
 */
function computeObv(bars: OhlcvBar[], _params: IndicatorParamValues): ObvPoint[] {
  const points: ObvPoint[] = [];
  let total = 0;

  bars.forEach((bar, i) => {
    if (i > 0) {
      const previousClose = bars[i - 1].close;
      if (bar.close > previousClose) total += bar.volume;
      else if (bar.close < previousClose) total -= bar.volume;
    }
    points.push({ time: bar.time, value: total });
  });

  return points;
}

function toLineData(points: ObvPoint[]): LineData[] {
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
    {
      color: stringParam(params, 'color', DEFAULT_LINE_COLOR),
      lineWidth: 1,
      // OBV 是成交量的累積量，數量級與價格無關，沿用量能的數字格式較好讀。
      priceFormat: { type: 'volume' },
    },
    paneIndex,
  );

  const setAll = (currentBars: OhlcvBar[], currentParams: IndicatorParamValues) => {
    series.applyOptions({ color: stringParam(currentParams, 'color', DEFAULT_LINE_COLOR) });
    series.setData(toLineData(computeObv(currentBars, currentParams)));
  };

  setAll(bars, params);

  return {
    update(nextBars, nextParams) {
      setAll(nextBars, nextParams);
    },
    dispose() {
      chart.removeSeries(series);
      paneIndexAllocator.release(paneIndex);
    },
    tooltipRows() {
      return [{ label: 'OBV', color: series.options().color, series }];
    },
  };
}

export const ObvIndicator: IndicatorDefinition<ObvPoint[]> = {
  id: 'obv',
  urlCode: 'ob',
  label: '能量潮（OBV）',
  placement: 'separate-pane',
  paramsSchema: [{ key: 'color', label: '線色', type: 'color', default: DEFAULT_LINE_COLOR }],
  compute: computeObv,
  mount,
};

registerIndicator(ObvIndicator);
