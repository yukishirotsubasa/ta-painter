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

const DEFAULT_RSV_PERIOD = 9;
const DEFAULT_K_PERIOD = 3;
const DEFAULT_D_PERIOD = 3;

const DEFAULT_K_COLOR = DEFAULT_LINE_COLOR;
const DEFAULT_D_COLOR = '#ff9800';

/** K/D 的遞迴起始值，台股慣例一律用 50。 */
const SEED = 50;

/** 超買／超賣參考線。 */
const LEVELS = [20, 80];

/** 高低完全相同（無波動）的視窗沒有相對位置可言，RSV 取中性值 50。 */
const NEUTRAL_RSV = 50;

export interface KdPoint {
  time: string;
  k: number;
  d: number;
}

/**
 * KD 隨機指標：RSV =（收盤 − n 日最低）/（n 日最高 − n 日最低）× 100，
 * K = 前一 K ×(1 − 1/kPeriod) + RSV × 1/kPeriod，D 對 K 再做一次同樣的平滑（K/D 初值皆 50）。
 * 資料不足 rsvPeriod 天的時間點不輸出（與其他指標一致）。
 */
function computeKd(bars: OhlcvBar[], params: IndicatorParamValues): KdPoint[] {
  const rsvPeriod = Math.max(1, Math.round(numberParam(params, 'rsvPeriod', DEFAULT_RSV_PERIOD)));
  const kPeriod = Math.max(1, Math.round(numberParam(params, 'kPeriod', DEFAULT_K_PERIOD)));
  const dPeriod = Math.max(1, Math.round(numberParam(params, 'dPeriod', DEFAULT_D_PERIOD)));

  const highs = rollingMax(bars.map((bar) => bar.high), rsvPeriod);
  const lows = rollingMin(bars.map((bar) => bar.low), rsvPeriod);
  if (highs.length === 0) return [];

  const points: KdPoint[] = [];
  let k = SEED;
  let d = SEED;

  for (let i = 0; i < highs.length; i += 1) {
    const barIndex = rsvPeriod - 1 + i;
    const span = highs[i] - lows[i];
    const rsv = span === 0 ? NEUTRAL_RSV : ((bars[barIndex].close - lows[i]) / span) * 100;

    k = k * (1 - 1 / kPeriod) + rsv / kPeriod;
    d = d * (1 - 1 / dPeriod) + k / dPeriod;
    points.push({ time: bars[barIndex].time, k, d });
  }

  return points;
}

function toLineData(points: KdPoint[], key: 'k' | 'd'): LineData[] {
  return points.map((point) => ({ time: point.time, value: point[key] }));
}

function mount(
  chart: IChartApi,
  paneIndexAllocator: PaneIndexAllocator,
  bars: OhlcvBar[],
  params: IndicatorParamValues,
): IndicatorMountHandle {
  const paneIndex = paneIndexAllocator.allocate();
  const kSeries: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    { color: stringParam(params, 'kColor', DEFAULT_K_COLOR), lineWidth: 1 },
    paneIndex,
  );
  const dSeries: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    { color: stringParam(params, 'dColor', DEFAULT_D_COLOR), lineWidth: 1 },
    paneIndex,
  );
  const referenceLines = createReferenceLines(kSeries, LEVELS);

  const setAll = (currentBars: OhlcvBar[], currentParams: IndicatorParamValues) => {
    const points = computeKd(currentBars, currentParams);
    kSeries.applyOptions({ color: stringParam(currentParams, 'kColor', DEFAULT_K_COLOR) });
    dSeries.applyOptions({ color: stringParam(currentParams, 'dColor', DEFAULT_D_COLOR) });
    kSeries.setData(toLineData(points, 'k'));
    dSeries.setData(toLineData(points, 'd'));
  };

  setAll(bars, params);

  return {
    update(nextBars, nextParams) {
      setAll(nextBars, nextParams);
    },
    dispose() {
      referenceLines.dispose();
      chart.removeSeries(kSeries);
      chart.removeSeries(dSeries);
      paneIndexAllocator.release(paneIndex);
    },
    tooltipRows() {
      return [
        { label: 'K', color: kSeries.options().color, series: kSeries },
        { label: 'D', color: dSeries.options().color, series: dSeries },
      ];
    },
  };
}

export const KdIndicator: IndicatorDefinition<KdPoint[]> = {
  id: 'kd',
  urlCode: 'kd',
  label: '隨機指標（KD）',
  placement: 'separate-pane',
  paramsSchema: [
    { key: 'rsvPeriod', label: 'RSV 週期', default: DEFAULT_RSV_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'kPeriod', label: 'K 平滑週期', default: DEFAULT_K_PERIOD, min: 1, max: 100, step: 1 },
    { key: 'dPeriod', label: 'D 平滑週期', default: DEFAULT_D_PERIOD, min: 1, max: 100, step: 1 },
    { key: 'kColor', label: 'K 線色', type: 'color', default: DEFAULT_K_COLOR },
    { key: 'dColor', label: 'D 線色', type: 'color', default: DEFAULT_D_COLOR },
  ],
  compute: computeKd,
  mount,
};

registerIndicator(KdIndicator);
