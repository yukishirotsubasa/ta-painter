import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { DEFAULT_LINE_COLOR } from '../colors';
import { sma } from './movingAverage';
import {
  DEFAULT_PRICE_SOURCE,
  PRICE_SOURCE_OPTIONS,
  paneIndexForSource,
  resolveSource,
  seriesOptionsForSource,
  sourceValues,
} from './priceSource';
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

export interface MaPoint {
  time: string;
  value: number;
}

/** 對 params.source 指定欄位計算週期為 params.period 的簡單移動平均；資料不足 period 天的時間點不輸出（無值可算）。 */
function computeMa(bars: OhlcvBar[], params: IndicatorParamValues): MaPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const values = sma(sourceValues(bars, resolveSource(params)), period);

  return values.map((value, i) => ({ time: bars[period - 1 + i].time, value }));
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
  const source = resolveSource(params);
  const series: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    seriesOptionsForSource(source, stringParam(params, 'color', DEFAULT_LINE_COLOR)),
    paneIndexForSource(source),
  );
  series.setData(toLineData(computeMa(bars, params)));

  let latestParams = params;

  return {
    update(nextBars, nextParams) {
      const nextSource = resolveSource(nextParams);
      series.applyOptions(seriesOptionsForSource(nextSource, stringParam(nextParams, 'color', DEFAULT_LINE_COLOR)));
      const targetPane = paneIndexForSource(nextSource);
      if (series.getPane().paneIndex() !== targetPane) {
        series.moveToPane(targetPane);
      }
      series.setData(toLineData(computeMa(nextBars, nextParams)));
      latestParams = nextParams;
    },
    dispose() {
      chart.removeSeries(series);
    },
    tooltipRows() {
      const period = Math.max(1, Math.round(numberParam(latestParams, 'period', DEFAULT_PERIOD)));
      return [{ label: `MA${period}`, color: series.options().color, series }];
    },
  };
}

export const MaIndicator: IndicatorDefinition<MaPoint[]> = {
  id: 'ma',
  urlCode: 'ma',
  label: '移動平均線（MA）',
  placement: 'overlay',
  paramsSchema: [
    { key: 'period', label: '週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    {
      key: 'source',
      label: '計算來源',
      type: 'enum',
      default: DEFAULT_PRICE_SOURCE,
      options: PRICE_SOURCE_OPTIONS,
    },
    { key: 'color', label: '線色', type: 'color', default: DEFAULT_LINE_COLOR },
  ],
  compute: computeMa,
  mount,
};

registerIndicator(MaIndicator);
