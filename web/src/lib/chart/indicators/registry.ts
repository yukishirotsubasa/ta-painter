import type { IndicatorDefinition } from './types';

const indicators = new Map<string, IndicatorDefinition>();

export function registerIndicator(definition: IndicatorDefinition): void {
  indicators.set(definition.id, definition);
}

export function getIndicator(id: string): IndicatorDefinition | undefined {
  return indicators.get(id);
}

export function listIndicators(): IndicatorDefinition[] {
  return Array.from(indicators.values());
}

export function clearIndicators(): void {
  indicators.clear();
}
