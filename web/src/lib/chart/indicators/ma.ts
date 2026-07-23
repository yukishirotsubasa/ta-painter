import {
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type LineSeriesPartialOptions,
} from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { registerIndicator } from './registry';
import {
  numberParam,
  stringParam,
  type IndicatorDefinition,
  type IndicatorMountHandle,
  type IndicatorParamValues,
  type IndicatorParamOption,
  type PaneIndexAllocator,
} from './types';

const DEFAULT_PERIOD = 20;
const DEFAULT_SOURCE = 'close';
/** lightweight-charts LineSeries 的預設線色，沿用作為 color 參數預設。 */
const DEFAULT_COLOR = '#2196f3';

/** MA 計算來源，對應 OhlcvBar 的數值欄位。 */
const SOURCE_OPTIONS: IndicatorParamOption[] = [
  { value: 'close', label: '收盤價' },
  { value: 'open', label: '開盤價' },
  { value: 'high', label: '最高價' },
  { value: 'low', label: '最低價' },
  { value: 'volume', label: '成交量' },
];

type MaSource = 'close' | 'open' | 'high' | 'low' | 'volume';

/**
 * pane 0 = 主圖（價格 scale）、pane 1 = 量能（成交量 scale），由 ChartContainer 保留。
 * source=volume 時 MA 數量級與價格差距過大，掛在主圖會撐爆價格 scale，故改掛量能 pane 與量能柱共用 scale。
 */
const PRICE_PANE_INDEX = 0;
const VOLUME_PANE_INDEX = 1;

export interface MaPoint {
  time: string;
  value: number;
}

function resolveSource(params: IndicatorParamValues): MaSource {
  const raw = stringParam(params, 'source', DEFAULT_SOURCE);
  return SOURCE_OPTIONS.some((option) => option.value === raw) ? (raw as MaSource) : DEFAULT_SOURCE;
}

function paneIndexForSource(source: MaSource): number {
  return source === 'volume' ? VOLUME_PANE_INDEX : PRICE_PANE_INDEX;
}

/** volume 來源沿用量能柱的 volume 數字格式，價格來源用預設 price 格式。 */
function seriesOptionsForSource(source: MaSource, color: string): LineSeriesPartialOptions {
  return {
    color,
    priceFormat: source === 'volume' ? { type: 'volume' } : { type: 'price' },
  };
}

/** 對 params.source 指定欄位計算週期為 params.period 的簡單移動平均；資料不足 period 天的時間點不輸出（無值可算）。 */
function computeMa(bars: OhlcvBar[], params: IndicatorParamValues): MaPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const source = resolveSource(params);
  const points: MaPoint[] = [];

  for (let i = period - 1; i < bars.length; i += 1) {
    const window = bars.slice(i - period + 1, i + 1);
    const sum = window.reduce((acc, bar) => acc + bar[source], 0);
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
  const source = resolveSource(params);
  const series: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    seriesOptionsForSource(source, stringParam(params, 'color', DEFAULT_COLOR)),
    paneIndexForSource(source),
  );
  series.setData(toLineData(computeMa(bars, params)));

  return {
    update(nextBars, nextParams) {
      const nextSource = resolveSource(nextParams);
      series.applyOptions(seriesOptionsForSource(nextSource, stringParam(nextParams, 'color', DEFAULT_COLOR)));
      const targetPane = paneIndexForSource(nextSource);
      if (series.getPane().paneIndex() !== targetPane) {
        series.moveToPane(targetPane);
      }
      series.setData(toLineData(computeMa(nextBars, nextParams)));
    },
    dispose() {
      chart.removeSeries(series);
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
    { key: 'source', label: '計算來源', type: 'enum', default: DEFAULT_SOURCE, options: SOURCE_OPTIONS },
    { key: 'color', label: '線色', type: 'color', default: DEFAULT_COLOR },
  ],
  compute: computeMa,
  mount,
};

registerIndicator(MaIndicator);
