import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { DEFAULT_LINE_COLOR } from '../colors';
import { ema } from './movingAverage';
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

const DEFAULT_PERIOD = 12;

export interface EmaPoint {
  time: string;
  value: number;
}

/**
 * 指數移動平均：與 MA 同樣可選計算來源與 pane 配置，差別只在權重——
 * 近期資料權重較高（`k = 2/(period+1)`），對轉折的反應比 SMA 快。
 * 資料不足 period 天的時間點不輸出（與 MA 一致）。
 */
function computeEma(bars: OhlcvBar[], params: IndicatorParamValues): EmaPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const values = ema(sourceValues(bars, resolveSource(params)), period);

  return values.map((value, i) => ({ time: bars[period - 1 + i].time, value }));
}

function toLineData(points: EmaPoint[]): LineData[] {
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
  series.setData(toLineData(computeEma(bars, params)));

  return {
    update(nextBars, nextParams) {
      const nextSource = resolveSource(nextParams);
      series.applyOptions(seriesOptionsForSource(nextSource, stringParam(nextParams, 'color', DEFAULT_LINE_COLOR)));
      const targetPane = paneIndexForSource(nextSource);
      if (series.getPane().paneIndex() !== targetPane) {
        series.moveToPane(targetPane);
      }
      series.setData(toLineData(computeEma(nextBars, nextParams)));
    },
    dispose() {
      chart.removeSeries(series);
    },
  };
}

export const EmaIndicator: IndicatorDefinition<EmaPoint[]> = {
  id: 'ema',
  urlCode: 'em',
  label: '指數移動平均（EMA）',
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
  compute: computeEma,
  mount,
};

registerIndicator(EmaIndicator);
