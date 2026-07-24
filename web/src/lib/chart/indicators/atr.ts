import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { DEFAULT_LINE_COLOR } from '../colors';
import { wilderRma } from './movingAverage';
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

export interface AtrPoint {
  time: string;
  value: number;
}

/**
 * 真實波幅（True Range）序列，長度與 `bars` 相同。
 * 第一根沒有前收盤價可比，退化成當日高低差。DMI（`dmi.ts`）也用這個函式，故對外匯出。
 */
export function trueRange(bars: OhlcvBar[]): number[] {
  return bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const previousClose = bars[i - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });
}

/** ATR = 真實波幅的 Wilder 平滑；資料不足 period 天的時間點不輸出。 */
function computeAtr(bars: OhlcvBar[], params: IndicatorParamValues): AtrPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const values = wilderRma(trueRange(bars), period);

  return values.map((value, i) => ({ time: bars[period - 1 + i].time, value }));
}

function toLineData(points: AtrPoint[]): LineData[] {
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

  const setAll = (currentBars: OhlcvBar[], currentParams: IndicatorParamValues) => {
    series.applyOptions({ color: stringParam(currentParams, 'color', DEFAULT_LINE_COLOR) });
    series.setData(toLineData(computeAtr(currentBars, currentParams)));
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
  };
}

export const AtrIndicator: IndicatorDefinition<AtrPoint[]> = {
  id: 'atr',
  urlCode: 'at',
  label: '真實波幅（ATR）',
  placement: 'separate-pane',
  paramsSchema: [
    { key: 'period', label: '週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'color', label: '線色', type: 'color', default: DEFAULT_LINE_COLOR },
  ],
  compute: computeAtr,
  mount,
};

registerIndicator(AtrIndicator);
