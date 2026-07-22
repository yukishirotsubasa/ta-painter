import type { IndicatorParamOption, IndicatorParamSchema, IndicatorParamValues } from './types';

/**
 * `IndicatorPanel` 依此決定要渲染哪種輸入元件與其目前值；純函式，不觸及 DOM，便於單元測試。
 * 當 params 尚無該 key 的值時回退 schema.default。
 */
export type ParamInputModel =
  | { kind: 'number'; value: number; min?: number; max?: number; step?: number }
  | { kind: 'enum'; value: string; options: IndicatorParamOption[] }
  | { kind: 'color'; value: string };

export function resolveParamInput(schema: IndicatorParamSchema, params: IndicatorParamValues): ParamInputModel {
  const current = params[schema.key];

  switch (schema.type) {
    case 'enum':
      return { kind: 'enum', value: asString(current, schema.default), options: schema.options };
    case 'color':
      return { kind: 'color', value: asString(current, schema.default) };
    default:
      return {
        kind: 'number',
        value: typeof current === 'number' ? current : schema.default,
        min: schema.min,
        max: schema.max,
        step: schema.step,
      };
  }
}

/** 將輸入元件的原始字串值依 schema 型別回寫成正確型別（number 型別化，enum/color 保留 string）。 */
export function coerceParamValue(schema: IndicatorParamSchema, raw: string): number | string {
  return schema.type === 'enum' || schema.type === 'color' ? raw : Number(raw);
}

function asString(current: number | string | undefined, fallback: string): string {
  return typeof current === 'string' ? current : fallback;
}
