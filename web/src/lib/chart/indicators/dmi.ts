import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { UP_COLOR, DOWN_COLOR } from '../colors';
import { trueRange } from './atr';
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
const DEFAULT_ADX_PERIOD = 14;

const DEFAULT_PLUS_COLOR = UP_COLOR;
const DEFAULT_MINUS_COLOR = DOWN_COLOR;
const DEFAULT_ADX_COLOR = '#e0e0e0';

/** ADX 慣用的「趨勢成形」門檻。 */
const LEVELS = [25];

export interface DmiPoint {
  time: string;
  plusDi: number;
  minusDi: number;
  /** ADX 比 ±DI 晚 adxPeriod-1 根才有值，未成形時為 null（該時間點不畫 ADX 線）。 */
  adx: number | null;
}

/**
 * DMI / ADX：
 * +DM =（今高 − 昨高）在大於（昨低 − 今低）且為正時取值，否則 0；−DM 反之。
 * ±DI = 100 × Wilder(±DM) / Wilder(TR)；DX = 100 × |+DI − −DI| / (+DI + −DI)；ADX = Wilder(DX)。
 * ±DM/TR 都是相鄰兩根的差，故序列從 bars[1] 起算，第一個 ±DI 落在 bars[period]。
 */
function computeDmi(bars: OhlcvBar[], params: IndicatorParamValues): DmiPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const adxPeriod = Math.max(1, Math.round(numberParam(params, 'adxPeriod', DEFAULT_ADX_PERIOD)));

  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  // trueRange()[0] 是沒有前收盤價的退化值，DMI 只用 bars[1] 之後的部分。
  const tr = trueRange(bars).slice(1);

  const smoothedPlus = wilderRma(plusDm, period);
  const smoothedMinus = wilderRma(minusDm, period);
  const smoothedTr = wilderRma(tr, period);
  if (smoothedTr.length === 0) return [];

  const plusDi = smoothedPlus.map((value, j) => (smoothedTr[j] === 0 ? 0 : (100 * value) / smoothedTr[j]));
  const minusDi = smoothedMinus.map((value, j) => (smoothedTr[j] === 0 ? 0 : (100 * value) / smoothedTr[j]));
  const dx = plusDi.map((plus, j) => {
    const sum = plus + minusDi[j];
    return sum === 0 ? 0 : (100 * Math.abs(plus - minusDi[j])) / sum;
  });
  const adx = wilderRma(dx, adxPeriod);

  return plusDi.map((plus, j) => ({
    // plusDm[0] 對應 bars[1]，smoothedPlus[j] 對應 plusDm[period-1+j]，故 bar 索引為 period+j。
    time: bars[period + j].time,
    plusDi: plus,
    minusDi: minusDi[j],
    adx: adx[j - (adxPeriod - 1)] ?? null,
  }));
}

function toLineData(points: DmiPoint[], key: 'plusDi' | 'minusDi'): LineData[] {
  return points.map((point) => ({ time: point.time, value: point[key] }));
}

/** ADX 尚未成形的時間點直接不輸出資料點（而非補 0，避免線從 0 拉上來）。 */
function toAdxLineData(points: DmiPoint[]): LineData[] {
  const data: LineData[] = [];
  for (const point of points) {
    if (point.adx !== null) data.push({ time: point.time, value: point.adx });
  }
  return data;
}

function mount(
  chart: IChartApi,
  paneIndexAllocator: PaneIndexAllocator,
  bars: OhlcvBar[],
  params: IndicatorParamValues,
): IndicatorMountHandle {
  const paneIndex = paneIndexAllocator.allocate();
  const plusSeries: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    { color: stringParam(params, 'plusColor', DEFAULT_PLUS_COLOR), lineWidth: 1 },
    paneIndex,
  );
  const minusSeries: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    { color: stringParam(params, 'minusColor', DEFAULT_MINUS_COLOR), lineWidth: 1 },
    paneIndex,
  );
  const adxSeries: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    { color: stringParam(params, 'adxColor', DEFAULT_ADX_COLOR), lineWidth: 1 },
    paneIndex,
  );
  const referenceLines = createReferenceLines(plusSeries, LEVELS);

  const setAll = (currentBars: OhlcvBar[], currentParams: IndicatorParamValues) => {
    const points = computeDmi(currentBars, currentParams);
    plusSeries.applyOptions({ color: stringParam(currentParams, 'plusColor', DEFAULT_PLUS_COLOR) });
    minusSeries.applyOptions({ color: stringParam(currentParams, 'minusColor', DEFAULT_MINUS_COLOR) });
    adxSeries.applyOptions({ color: stringParam(currentParams, 'adxColor', DEFAULT_ADX_COLOR) });
    plusSeries.setData(toLineData(points, 'plusDi'));
    minusSeries.setData(toLineData(points, 'minusDi'));
    adxSeries.setData(toAdxLineData(points));
  };

  setAll(bars, params);

  return {
    update(nextBars, nextParams) {
      setAll(nextBars, nextParams);
    },
    dispose() {
      referenceLines.dispose();
      chart.removeSeries(plusSeries);
      chart.removeSeries(minusSeries);
      chart.removeSeries(adxSeries);
      paneIndexAllocator.release(paneIndex);
    },
    tooltipRows() {
      return [
        { label: '+DI', color: plusSeries.options().color, series: plusSeries },
        { label: '−DI', color: minusSeries.options().color, series: minusSeries },
        { label: 'ADX', color: adxSeries.options().color, series: adxSeries },
      ];
    },
  };
}

export const DmiIndicator: IndicatorDefinition<DmiPoint[]> = {
  id: 'dmi',
  urlCode: 'dm',
  label: '趨向指標（DMI／ADX）',
  placement: 'separate-pane',
  paramsSchema: [
    { key: 'period', label: 'DI 週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'adxPeriod', label: 'ADX 平滑週期', default: DEFAULT_ADX_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'plusColor', label: '+DI 線色', type: 'color', default: DEFAULT_PLUS_COLOR },
    { key: 'minusColor', label: '−DI 線色', type: 'color', default: DEFAULT_MINUS_COLOR },
    { key: 'adxColor', label: 'ADX 線色', type: 'color', default: DEFAULT_ADX_COLOR },
  ],
  compute: computeDmi,
  mount,
};

registerIndicator(DmiIndicator);
