import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { DEFAULT_LINE_COLOR } from '../colors';
import { wilderRma } from './movingAverage';
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

/** 超買／超賣參考線。 */
const LEVELS = [30, 70];

export interface RsiPoint {
  time: string;
  value: number;
}

/**
 * RSI：對相鄰收盤價差的漲幅與跌幅各做一次 Wilder 平滑，RSI = 100 − 100/(1 + 平均漲幅/平均跌幅)。
 * 平均跌幅為 0（區間內只漲不跌）時 RS 發散，直接輸出 100。
 * 需要 period + 1 根 K 棒才有第一個值（差值序列比 bars 少一筆）。
 */
function computeRsi(bars: OhlcvBar[], params: IndicatorParamValues): RsiPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const change = bars[i].close - bars[i - 1].close;
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }

  const avgGains = wilderRma(gains, period);
  const avgLosses = wilderRma(losses, period);

  return avgGains.map((avgGain, i) => {
    const avgLoss = avgLosses[i];
    const value = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    // gains[0] 對應 bars[1]，故 avgGains[i] 對應 bars[period + i]。
    return { time: bars[period + i].time, value };
  });
}

function toLineData(points: RsiPoint[]): LineData[] {
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
    series.setData(toLineData(computeRsi(currentBars, currentParams)));
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
      return [{ label: `RSI${period}`, color: series.options().color, series }];
    },
  };
}

export const RsiIndicator: IndicatorDefinition<RsiPoint[]> = {
  id: 'rsi',
  urlCode: 'rs',
  label: '相對強弱指標（RSI）',
  placement: 'separate-pane',
  paramsSchema: [
    { key: 'period', label: '週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'color', label: '線色', type: 'color', default: DEFAULT_LINE_COLOR },
  ],
  compute: computeRsi,
  mount,
};

registerIndicator(RsiIndicator);
