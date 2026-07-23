import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
// side-effect：把 MA／布林／MACD 註冊進 registry，短代碼才查得到。
import '../chart/indicators/ma';
import '../chart/indicators/bollinger';
import '../chart/indicators/macd';
import { getIndicator } from '../chart/indicators/registry';
import type { ShareState } from './schema';
import { decodeShareState, encodeShareState } from './urlState';

/** 依 registry paramsSchema 產生「全預設」參數，再覆寫要測的欄位。 */
function paramsOf(definitionId: string, overrides: Record<string, number | string> = {}) {
  const definition = getIndicator(definitionId);
  if (!definition) throw new Error(`indicator not registered: ${definitionId}`);
  return {
    ...Object.fromEntries(definition.paramsSchema.map((schema) => [schema.key, schema.default])),
    ...overrides,
  };
}

const BASE_STATE: ShareState = {
  symbol: '2330',
  prov: 'yahoo',
  range: { start: '2024-01-01', end: '2024-06-30' },
  indicators: [],
  lines: [],
};

/** 直接組出未壓縮的精簡字串再壓縮，用來測「損壞的單一項目」。 */
function encodePayload(payload: string): string {
  return compressToEncodedURIComponent(payload);
}

function decodePayload(encoded: string): string {
  return decompressFromEncodedURIComponent(encoded) ?? '';
}

describe('encodeShareState / decodeShareState round-trip', () => {
  it('restores a state with indicators and lines deeply equal to the original', () => {
    const state: ShareState = {
      symbol: '00631L',
      prov: 'official',
      range: { start: '2023-11-05', end: '2024-06-30' },
      indicators: [
        { definitionId: 'ma', params: paramsOf('ma', { period: 60, source: 'volume', color: '#ff0000' }) },
        { definitionId: 'bollinger', params: paramsOf('bollinger', { stdDevMultiplier: 2.5 }) },
        { definitionId: 'macd', params: paramsOf('macd') },
      ],
      lines: [
        {
          points: [
            { time: '2024-01-02', price: 593.5 },
            { time: '2024-03-15', price: 780.25 },
          ],
          color: '#f5a623',
          width: 2,
        },
        {
          points: [
            { time: 1704153600, price: 12.125 },
            { time: 1710460800, price: 9 },
          ],
          color: '#2196f3',
          width: 4,
        },
      ],
    };

    expect(decodeShareState(encodeShareState(state))).toEqual(state);
  });

  it('restores a state with no indicators and no lines', () => {
    expect(decodeShareState(encodeShareState(BASE_STATE))).toEqual(BASE_STATE);
  });

  it('keeps both data sources round-trippable', () => {
    for (const prov of ['yahoo', 'official'] as const) {
      const state = { ...BASE_STATE, prov };
      expect(decodeShareState(encodeShareState(state))).toEqual(state);
    }
  });
});

describe('compact encoding', () => {
  it('omits params equal to the registry default and keeps the short indicator code', () => {
    const encoded = encodeShareState({
      ...BASE_STATE,
      indicators: [{ definitionId: 'ma', params: paramsOf('ma') }],
    });

    expect(decodePayload(encoded)).toBe('2330|y|20240101~20240630|ma|');
  });

  it('emits args in paramsSchema order and drops only trailing defaults', () => {
    const encoded = encodeShareState({
      ...BASE_STATE,
      indicators: [
        { definitionId: 'ma', params: paramsOf('ma', { period: 60, source: 'volume', color: '#ff0000' }) },
        // 只改 color：前面兩個預設值仍需占位，尾端才不會錯位。
        { definitionId: 'ma', params: paramsOf('ma', { color: '#ff0000' }) },
      ],
    });

    expect(decodePayload(encoded)).toBe('2330|y|20240101~20240630|ma:60~v~f00,ma:~~f00|');
  });

  it('fills registry defaults back for omitted params', () => {
    const restored = decodeShareState(encodePayload('2330|y|20240101~20240630|ma|'));

    expect(restored?.indicators).toEqual([{ definitionId: 'ma', params: paramsOf('ma') }]);
  });

  it('fills registry defaults back for blank args in the middle', () => {
    const restored = decodeShareState(encodePayload('2330|y|20240101~20240630|ma:~~f00|'));

    expect(restored?.indicators).toEqual([{ definitionId: 'ma', params: paramsOf('ma', { color: '#ff0000' }) }]);
  });
});

describe('per-item fault tolerance', () => {
  it('drops a corrupted indicator and keeps the rest', () => {
    const restored = decodeShareState(
      encodePayload('2330|y|20240101~20240630|ma:60,zz:1~2,bb:abc,md|'),
    );

    expect(restored).not.toBeNull();
    expect(restored?.indicators.map((indicator) => indicator.definitionId)).toEqual(['ma', 'macd']);
    expect(restored?.indicators[0].params).toEqual(paramsOf('ma', { period: 60 }));
  });

  it('drops a corrupted line and keeps the rest', () => {
    const restored = decodeShareState(
      encodePayload(
        '2330|y|20240101~20240630||20240102~593.5~20240315~780.25~f5a623~2,broken,20240102~xx~20240315~1~f00~2,20240401~10~20240501~20~2196f3~4',
      ),
    );

    expect(restored?.lines).toEqual([
      {
        points: [
          { time: '2024-01-02', price: 593.5 },
          { time: '2024-03-15', price: 780.25 },
        ],
        color: '#f5a623',
        width: 2,
      },
      {
        points: [
          { time: '2024-04-01', price: 10 },
          { time: '2024-05-01', price: 20 },
        ],
        color: '#2196f3',
        width: 4,
      },
    ]);
  });

  it('does not throw and keeps every other item when both an indicator and a line are corrupted', () => {
    expect(() =>
      decodeShareState(encodePayload('2330|y|20240101~20240630|ma,!!!|20240102~1~20240315~2~f00~2,nope')),
    ).not.toThrow();

    const restored = decodeShareState(
      encodePayload('2330|y|20240101~20240630|ma,!!!|20240102~1~20240315~2~f00~2,nope'),
    );

    expect(restored?.indicators).toHaveLength(1);
    expect(restored?.lines).toHaveLength(1);
  });

  it('falls back to the default line width when the width field is missing', () => {
    const restored = decodeShareState(
      encodePayload('2330|y|20240101~20240630||20240102~1~20240315~2~f00'),
    );

    expect(restored?.lines[0].width).toBe(2);
  });
});

describe('whole-payload failures', () => {
  it('returns null for input that is not a valid compressed payload', () => {
    for (const broken of ['', 'not-compressed-at-all', '@@@@']) {
      expect(decodeShareState(broken)).toBeNull();
    }
  });

  it('returns null when required fields are missing or invalid', () => {
    for (const payload of ['', '2330', '2330|y', '2330|x|20240101~20240630||', '2330|y|2024~20240630||', '|y|20240101~20240630||']) {
      expect(decodeShareState(encodePayload(payload))).toBeNull();
    }
  });
});
