import type { IndicatorDefinition } from './types';

const indicators = new Map<string, IndicatorDefinition>();
/** urlCode → definition 的反查索引（share1），與 id 索引同步維護。 */
const byUrlCode = new Map<string, IndicatorDefinition>();

export function registerIndicator(definition: IndicatorDefinition): void {
  const previous = indicators.get(definition.id);
  if (previous) byUrlCode.delete(previous.urlCode);
  indicators.set(definition.id, definition);
  byUrlCode.set(definition.urlCode, definition);
}

export function getIndicator(id: string): IndicatorDefinition | undefined {
  return indicators.get(id);
}

/** 以 URL 短代碼取得指標定義（share1 解碼用）；未知代碼回傳 undefined 由呼叫端捨棄該項。 */
export function getIndicatorByUrlCode(urlCode: string): IndicatorDefinition | undefined {
  return byUrlCode.get(urlCode);
}

export function listIndicators(): IndicatorDefinition[] {
  return Array.from(indicators.values());
}

export function clearIndicators(): void {
  indicators.clear();
  byUrlCode.clear();
}
