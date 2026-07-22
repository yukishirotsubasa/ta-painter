import { describe, expect, it } from 'vitest';
import { coerceParamValue, resolveParamInput } from './paramInput';
import { numberParam, type IndicatorParamSchema } from './types';

/** 含 number/enum/color 三種型別的測試指標 schema，驗證面板依 type 選對輸入元件與回寫值。 */
const numberSchema: IndicatorParamSchema = { key: 'period', label: '週期', default: 20, min: 1, max: 240, step: 1 };
const enumSchema: IndicatorParamSchema = {
  key: 'source',
  label: '來源',
  type: 'enum',
  default: 'close',
  options: [
    { value: 'close', label: '收盤' },
    { value: 'open', label: '開盤' },
  ],
};
const colorSchema: IndicatorParamSchema = { key: 'color', label: '顏色', type: 'color', default: '#ff0000' };

describe('resolveParamInput', () => {
  it('選 number 輸入並回退 default', () => {
    expect(resolveParamInput(numberSchema, {})).toEqual({ kind: 'number', value: 20, min: 1, max: 240, step: 1 });
  });

  it('number 讀取已存在的數值', () => {
    expect(resolveParamInput(numberSchema, { period: 5 })).toMatchObject({ kind: 'number', value: 5 });
  });

  it('選 enum 輸入並帶出 options', () => {
    const model = resolveParamInput(enumSchema, {});
    expect(model).toEqual({ kind: 'enum', value: 'close', options: enumSchema.type === 'enum' ? enumSchema.options : [] });
  });

  it('enum 讀取已存在的選項值', () => {
    expect(resolveParamInput(enumSchema, { source: 'open' })).toMatchObject({ kind: 'enum', value: 'open' });
  });

  it('選 color 輸入並回退 default', () => {
    expect(resolveParamInput(colorSchema, {})).toEqual({ kind: 'color', value: '#ff0000' });
  });
});

describe('coerceParamValue', () => {
  it('number 型別回寫為 number', () => {
    const value = coerceParamValue(numberSchema, '12');
    expect(value).toBe(12);
    expect(typeof value).toBe('number');
  });

  it('enum 型別保留 string', () => {
    expect(coerceParamValue(enumSchema, 'open')).toBe('open');
  });

  it('color 型別保留 string', () => {
    expect(coerceParamValue(colorSchema, '#00ff00')).toBe('#00ff00');
  });
});

describe('numberParam', () => {
  it('容忍以 string 儲存的數字', () => {
    expect(numberParam({ period: '30' }, 'period', 20)).toBe(30);
  });

  it('缺值或空字串回退 fallback', () => {
    expect(numberParam({}, 'period', 20)).toBe(20);
    expect(numberParam({ period: '' }, 'period', 20)).toBe(20);
  });

  it('非數字字串回退 fallback', () => {
    expect(numberParam({ period: 'close' }, 'period', 20)).toBe(20);
  });
});
