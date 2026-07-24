import type { LineSeriesPartialOptions } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { PRICE_PANE_INDEX, VOLUME_PANE_INDEX } from '../panes';
import { stringParam, type IndicatorParamOption, type IndicatorParamValues } from './types';

/**
 * 「計算來源」參數的共用實作（indicator12，原本寫在 `ma.ts` 內）。
 * MA 與 EMA 都讓使用者選擇對哪個欄位取平均，兩邊共用同一份選項、pane 配置與 series 選項。
 */

export const DEFAULT_PRICE_SOURCE = 'close';

/** 計算來源，對應 OhlcvBar 的數值欄位。 */
export const PRICE_SOURCE_OPTIONS: IndicatorParamOption[] = [
  { value: 'close', label: '收盤價' },
  { value: 'open', label: '開盤價' },
  { value: 'high', label: '最高價' },
  { value: 'low', label: '最低價' },
  { value: 'volume', label: '成交量' },
];

export type PriceSource = 'close' | 'open' | 'high' | 'low' | 'volume';

/** 讀 `params.source`，非合法值一律回退 close。 */
export function resolveSource(params: IndicatorParamValues): PriceSource {
  const raw = stringParam(params, 'source', DEFAULT_PRICE_SOURCE);
  return PRICE_SOURCE_OPTIONS.some((option) => option.value === raw)
    ? (raw as PriceSource)
    : DEFAULT_PRICE_SOURCE;
}

/** 取出 bars 上該來源欄位的數值序列。 */
export function sourceValues(bars: OhlcvBar[], source: PriceSource): number[] {
  return bars.map((bar) => bar[source]);
}

/**
 * source=volume 時均值的數量級與價格差距過大，掛在主圖會撐爆價格 scale，
 * 故改掛量能 pane 與量能柱共用 scale。
 */
export function paneIndexForSource(source: PriceSource): number {
  return source === 'volume' ? VOLUME_PANE_INDEX : PRICE_PANE_INDEX;
}

/** volume 來源沿用量能柱的 volume 數字格式，價格來源用預設 price 格式。 */
export function seriesOptionsForSource(source: PriceSource, color: string): LineSeriesPartialOptions {
  return {
    color,
    priceFormat: source === 'volume' ? { type: 'volume' } : { type: 'price' },
  };
}
