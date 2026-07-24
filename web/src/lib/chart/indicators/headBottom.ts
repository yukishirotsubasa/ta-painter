import {
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { sma } from './movingAverage';
import { PRICE_PANE_INDEX } from '../panes';
import { registerIndicator } from './registry';
import {
  numberParam,
  stringParam,
  type IndicatorDefinition,
  type IndicatorMountHandle,
  type IndicatorParamValues,
  type PaneIndexAllocator,
} from './types';

const DEFAULT_PERIOD = 5;

/** 紫色，與既有的藍（MA/布林/DIF）、橘（DEA）、黃（手繪線）、紅綠（漲跌）都區隔得開。 */
const DEFAULT_COLOR = '#ab47bc';

export interface HeadBottomPoint {
  time: string;
  price: number;
  kind: 'head' | 'bottom';
}

interface Crossing {
  index: number;
  direction: 'up' | 'down';
}

/**
 * 頭底分析。
 *
 * 以可調週期的均線為基準，**收盤價**每次穿越均線就切出一個區間；每次穿越時回頭看**上一個區間**：
 *
 * - 向上突破 → 上個區間是價格在均線下方的一段，取其中**最低價的最小值**當作「底」。
 * - 向下突破 → 上個區間是價格在均線上方的一段，取其中**最高價的最大值**當作「頭」。
 *
 * 回傳的樞紐點依時間排序，呼叫端直接餵給 `LineSeries` 就會連成頭底頭底的折線。
 *
 * 幾個刻意的判定細節：
 * - `close === ma` 視為「不在上方」，避免貼著均線走時同一根反覆觸發。
 * - 區間是**半開**的 `[上一次突破的位置, 這次突破的前一根]`：新的突破 K 棒屬於下一個區間。
 *   第一次突破的區間起點用 `period - 1`（均線第一個有值的位置）。
 * - 極值同值時取**較早**的一根。
 * - **最後一次突破之後的區間不輸出任何點**——它還沒有被下一次突破確認，極值會隨新 K 棒變動。
 */
function computeHeadBottom(bars: OhlcvBar[], params: IndicatorParamValues): HeadBottomPoint[] {
  const period = Math.max(1, Math.round(numberParam(params, 'period', DEFAULT_PERIOD)));
  const maValues = sma(bars.map((bar) => bar.close), period);
  if (maValues.length < 2) return [];

  const firstIndex = period - 1;
  const isAbove = (index: number) => bars[index].close > maValues[index - firstIndex];

  const crossings: Crossing[] = [];
  for (let i = firstIndex + 1; i < bars.length; i += 1) {
    if (isAbove(i) !== isAbove(i - 1)) {
      crossings.push({ index: i, direction: isAbove(i) ? 'up' : 'down' });
    }
  }

  const points: HeadBottomPoint[] = [];
  let segmentStart = firstIndex;

  for (const crossing of crossings) {
    const segmentEnd = crossing.index - 1;
    const kind = crossing.direction === 'up' ? 'bottom' : 'head';

    let extremeIndex = segmentStart;
    for (let i = segmentStart + 1; i <= segmentEnd; i += 1) {
      const isBetter =
        kind === 'bottom' ? bars[i].low < bars[extremeIndex].low : bars[i].high > bars[extremeIndex].high;
      if (isBetter) extremeIndex = i;
    }

    points.push({
      time: bars[extremeIndex].time,
      price: kind === 'bottom' ? bars[extremeIndex].low : bars[extremeIndex].high,
      kind,
    });
    segmentStart = crossing.index;
  }

  return points;
}

function toLineData(points: HeadBottomPoint[]): LineData[] {
  return points.map((point) => ({ time: point.time, value: point.price }));
}

/** 頭在 K 棒上方朝下、底在 K 棒下方朝上；抽成匯出的純函式，測試不必碰 markers plugin。 */
export function toHeadBottomMarkers(points: HeadBottomPoint[], color: string): SeriesMarker<Time>[] {
  return points.map((point) => ({
    time: point.time as Time,
    position: point.kind === 'head' ? 'aboveBar' : 'belowBar',
    shape: point.kind === 'head' ? 'arrowDown' : 'arrowUp',
    color,
    text: point.kind === 'head' ? '頭' : '底',
  }));
}

function mount(
  chart: IChartApi,
  _paneIndexAllocator: PaneIndexAllocator,
  bars: OhlcvBar[],
  params: IndicatorParamValues,
): IndicatorMountHandle {
  const series: ISeriesApi<'Line'> = chart.addSeries(
    LineSeries,
    {
      color: stringParam(params, 'color', DEFAULT_COLOR),
      lineWidth: 2,
      pointMarkersVisible: true,
      // 折線只在樞紐點有資料，最後值標籤與價格線對它沒有意義。
      lastValueVisible: false,
      priceLineVisible: false,
    },
    PRICE_PANE_INDEX,
  );
  const markers: ISeriesMarkersPluginApi<Time> = createSeriesMarkers(series);

  const setAll = (currentBars: OhlcvBar[], currentParams: IndicatorParamValues) => {
    const color = stringParam(currentParams, 'color', DEFAULT_COLOR);
    const points = computeHeadBottom(currentBars, currentParams);
    series.applyOptions({ color });
    series.setData(toLineData(points));
    markers.setMarkers(toHeadBottomMarkers(points, color));
  };

  setAll(bars, params);

  return {
    update(nextBars, nextParams) {
      setAll(nextBars, nextParams);
    },
    dispose() {
      markers.detach();
      chart.removeSeries(series);
    },
  };
}

export const HeadBottomIndicator: IndicatorDefinition<HeadBottomPoint[]> = {
  id: 'headBottom',
  urlCode: 'hb',
  label: '頭底分析',
  placement: 'overlay',
  paramsSchema: [
    { key: 'period', label: '均線週期', default: DEFAULT_PERIOD, min: 1, max: 240, step: 1 },
    { key: 'color', label: '連線色', type: 'color', default: DEFAULT_COLOR },
  ],
  compute: computeHeadBottom,
  mount,
};

registerIndicator(HeadBottomIndicator);
