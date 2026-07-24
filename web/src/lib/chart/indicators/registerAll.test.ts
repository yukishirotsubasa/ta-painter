import { describe, expect, it } from 'vitest';
import './registerAll';
import { listIndicators } from './registry';

/**
 * 全域約束檢查：新增指標時最容易踩到的是短代碼撞號（會讓既有分享連結解到錯的指標）
 * 與參數預設值缺漏（UI 新增時會拿到 undefined）。這裡一次守住所有已註冊的指標。
 */
describe('registered indicators', () => {
  const definitions = listIndicators();

  it('registers every built-in indicator exactly once', () => {
    const ids = definitions.map((definition) => definition.id);

    expect(ids).toEqual([
      'ma',
      'ema',
      'bollinger',
      'sar',
      'headBottom',
      'macd',
      'kd',
      'rsi',
      'atr',
      'dmi',
      'cci',
      'williams',
      'bias',
      'roc',
      'obv',
    ]);
  });

  it('gives every indicator a globally unique url code', () => {
    const codes = definitions.map((definition) => definition.urlCode);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('keeps url codes free of the characters used as encoding separators', () => {
    for (const definition of definitions) {
      expect(definition.urlCode).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('gives every param a default value and unique key within its indicator', () => {
    for (const definition of definitions) {
      const keys = definition.paramsSchema.map((schema) => schema.key);
      expect(new Set(keys).size, `${definition.id} has duplicate param keys`).toBe(keys.length);

      for (const schema of definition.paramsSchema) {
        expect(schema.default, `${definition.id}.${schema.key} has no default`).toBeDefined();
      }
    }
  });

  it('gives every indicator a non-empty label and a valid placement', () => {
    for (const definition of definitions) {
      expect(definition.label.length).toBeGreaterThan(0);
      expect(['overlay', 'separate-pane']).toContain(definition.placement);
    }
  });

  it('computes without throwing on an empty bar array', () => {
    for (const definition of definitions) {
      expect(() => definition.compute([], {}), `${definition.id} threw on empty bars`).not.toThrow();
    }
  });
});
