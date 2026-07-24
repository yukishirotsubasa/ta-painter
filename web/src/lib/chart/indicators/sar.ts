import { LineSeries, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { UP_COLOR, DOWN_COLOR } from '../colors';
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

const DEFAULT_STEP = 0.02;
const DEFAULT_MAX_STEP = 0.2;

const DEFAULT_LONG_COLOR = UP_COLOR;
const DEFAULT_SHORT_COLOR = DOWN_COLOR;

export interface SarPoint {
  time: string;
  value: number;
  /** true = 多頭段（SAR 在 K 棒下方），false = 空頭段（SAR 在 K 棒上方）。 */
  isLong: boolean;
}

/**
 * Wilder 拋物線轉向（Parabolic SAR）。
 *
 * 起始方向由前兩根收盤價決定，加速因子 AF 從 `step` 起算、每創新極值加一個 `step`、上限 `maxStep`。
 * 每根先推進 `SAR += AF × (EP − SAR)`，再夾住不得侵入前兩根的價格區間（Wilder 原始規則），
 * 最後檢查是否被當根價格穿越而反轉（反轉時 SAR 設為原本的 EP、EP 設為當根極值、AF 重置）。
 *
 * 需要至少 3 根 K 棒（前兩根用來定初始方向與 SAR/EP），輸出從第 3 根開始。
 */
function computeSar(bars: OhlcvBar[], params: IndicatorParamValues): SarPoint[] {
  const step = Math.max(0.001, numberParam(params, 'step', DEFAULT_STEP));
  const maxStep = Math.max(step, numberParam(params, 'maxStep', DEFAULT_MAX_STEP));
  if (bars.length < 3) return [];

  let isLong = bars[1].close >= bars[0].close;
  let sar = isLong ? Math.min(bars[0].low, bars[1].low) : Math.max(bars[0].high, bars[1].high);
  let extremePoint = isLong ? Math.max(bars[0].high, bars[1].high) : Math.min(bars[0].low, bars[1].low);
  let accelerationFactor = step;

  const points: SarPoint[] = [];

  for (let i = 2; i < bars.length; i += 1) {
    sar += accelerationFactor * (extremePoint - sar);

    // SAR 不得落在前兩根的價格區間內，否則會在盤整時被立刻穿越。
    if (isLong) sar = Math.min(sar, bars[i - 1].low, bars[i - 2].low);
    else sar = Math.max(sar, bars[i - 1].high, bars[i - 2].high);

    if (isLong && bars[i].low < sar) {
      isLong = false;
      sar = extremePoint;
      extremePoint = bars[i].low;
      accelerationFactor = step;
    } else if (!isLong && bars[i].high > sar) {
      isLong = true;
      sar = extremePoint;
      extremePoint = bars[i].high;
      accelerationFactor = step;
    } else if (isLong && bars[i].high > extremePoint) {
      extremePoint = bars[i].high;
      accelerationFactor = Math.min(accelerationFactor + step, maxStep);
    } else if (!isLong && bars[i].low < extremePoint) {
      extremePoint = bars[i].low;
      accelerationFactor = Math.min(accelerationFactor + step, maxStep);
    }

    points.push({ time: bars[i].time, value: sar, isLong });
  }

  return points;
}

/** 每個點自帶顏色（多空分色），線本身隱藏、只顯示點，呈現傳統的拋物線點列。 */
function toLineData(points: SarPoint[], longColor: string, shortColor: string): LineData[] {
  return points.map((point) => ({
    time: point.time,
    value: point.value,
    color: point.isLong ? longColor : shortColor,
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
    { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 2 },
    PRICE_PANE_INDEX,
  );

  const setAll = (currentBars: OhlcvBar[], currentParams: IndicatorParamValues) => {
    const longColor = stringParam(currentParams, 'longColor', DEFAULT_LONG_COLOR);
    const shortColor = stringParam(currentParams, 'shortColor', DEFAULT_SHORT_COLOR);
    series.setData(toLineData(computeSar(currentBars, currentParams), longColor, shortColor));
  };

  setAll(bars, params);

  return {
    update(nextBars, nextParams) {
      setAll(nextBars, nextParams);
    },
    dispose() {
      chart.removeSeries(series);
    },
    tooltipRows() {
      // 線本身隱藏、色在逐點資料上（多空分色），tooltip 端會優先採用該點顏色。
      return [{ label: 'SAR', color: series.options().color, series }];
    },
  };
}

export const SarIndicator: IndicatorDefinition<SarPoint[]> = {
  id: 'sar',
  urlCode: 'sr',
  label: '拋物線轉向（SAR）',
  placement: 'overlay',
  paramsSchema: [
    { key: 'step', label: '加速因子', default: DEFAULT_STEP, min: 0.001, max: 0.5, step: 0.001 },
    { key: 'maxStep', label: '加速上限', default: DEFAULT_MAX_STEP, min: 0.01, max: 1, step: 0.01 },
    { key: 'longColor', label: '多頭點色', type: 'color', default: DEFAULT_LONG_COLOR },
    { key: 'shortColor', label: '空頭點色', type: 'color', default: DEFAULT_SHORT_COLOR },
  ],
  compute: computeSar,
  mount,
};

registerIndicator(SarIndicator);
