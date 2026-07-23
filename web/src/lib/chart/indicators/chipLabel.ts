import type { IndicatorDefinition, IndicatorParamValues } from './types';

/** 只取指標定義的簡稱：`移動平均線（MA）` → `MA`，沒有全形括號時用原標籤。 */
export function indicatorShortLabel(label: string): string {
  const matched = /（([^）]+)）/.exec(label);
  return matched ? matched[1] : label;
}

/**
 * 行動版圖例 chip 的文字（responsive2）：簡稱 + 數值參數，例如 `MA(20)`、`MACD(12,26,9)`。
 * 只帶數值參數：顏色看 chip 上的色點、enum 值（如計算來源）在 chip 上放不下，需要時展開參數面板看。
 */
export function indicatorChipLabel(definition: IndicatorDefinition, params: IndicatorParamValues): string {
  const numbers = definition.paramsSchema
    .filter((schema) => (schema.type ?? 'number') === 'number')
    .map((schema) => {
      const raw = params[schema.key] ?? schema.default;
      return typeof raw === 'number' ? String(raw) : raw;
    });

  const short = indicatorShortLabel(definition.label);
  return numbers.length > 0 ? `${short}(${numbers.join(',')})` : short;
}

/** chip 上的色點：取第一個顏色參數的值，指標沒有顏色參數時回 `null`（不畫點）。 */
export function indicatorChipColor(definition: IndicatorDefinition, params: IndicatorParamValues): string | null {
  const schema = definition.paramsSchema.find((candidate) => candidate.type === 'color');
  if (!schema) return null;

  const raw = params[schema.key];
  return typeof raw === 'string' && raw !== '' ? raw : String(schema.default);
}
