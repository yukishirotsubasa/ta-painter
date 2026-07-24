import { describe, expect, it } from 'vitest';
import type { Time } from 'lightweight-charts';
import type { DrawnLine } from '../chart/drawing/drawingController';
// side-effect：註冊所有內建指標，短代碼與 paramsSchema 才查得到。
import '../chart/indicators/registerAll';
import { getIndicator } from '../chart/indicators/registry';
import type { ShareState } from './schema';
import {
  formatShareHash,
  readShareHash,
  toIndicatorInstances,
  toShareIndicators,
  toShareLines,
  toShareTime,
  toTrendLinePoints,
} from './shareUrl';

function paramsOf(definitionId: string, overrides: Record<string, number | string> = {}) {
  const definition = getIndicator(definitionId);
  if (!definition) throw new Error(`indicator not registered: ${definitionId}`);
  return {
    ...Object.fromEntries(definition.paramsSchema.map((schema) => [schema.key, schema.default])),
    ...overrides,
  };
}

const STATE: ShareState = {
  symbol: '2330',
  prov: 'official',
  range: { start: '2024-01-01', end: '2024-06-30' },
  indicators: [{ definitionId: 'ma', params: paramsOf('ma', { period: 60, color: '#ff0000' }) }],
  lines: [
    {
      points: [
        { time: '2024-01-02', price: 593.5 },
        { time: '2024-03-15', price: 780.25 },
      ],
      color: '#f5a623',
      width: 2,
    },
  ],
  useAdjusted: false,
};

describe('readShareHash / formatShareHash', () => {
  it('round-trips a state through the hash', () => {
    const result = readShareHash(formatShareHash(STATE));

    expect(result).toEqual({ status: 'ok', state: STATE });
  });

  it('accepts the hash with or without the leading #', () => {
    const hash = formatShareHash(STATE);

    expect(readShareHash(hash.slice(1))).toEqual({ status: 'ok', state: STATE });
  });

  it('round-trips useAdjusted=true', () => {
    const adjusted: ShareState = { ...STATE, useAdjusted: true };
    expect(readShareHash(formatShareHash(adjusted))).toEqual({ status: 'ok', state: adjusted });
  });

  it('reports absent when there is no s= parameter', () => {
    for (const hash of ['', '#', '#foo=1', '#2330']) {
      expect(readShareHash(hash)).toEqual({ status: 'absent' });
    }
  });

  it('reports invalid (never throws) for a corrupted payload', () => {
    expect(readShareHash('#s=not-a-real-payload')).toEqual({ status: 'invalid' });
    expect(readShareHash('#s=')).toEqual({ status: 'invalid' });
  });

  it('survives payloads containing "+" (URLSearchParams would turn it into a space)', () => {
    // lz-string 的編碼字母表含 '+'，找一個真的會產生 '+' 的狀態，確認解析不經 URLSearchParams。
    const states: ShareState[] = Array.from({ length: 60 }, (_, index) => ({
      ...STATE,
      symbol: String(1000 + index),
    }));
    const withPlus = states.map(formatShareHash).filter((hash) => hash.includes('+'));

    expect(withPlus.length).toBeGreaterThan(0);
    for (const hash of withPlus) {
      expect(readShareHash(hash).status).toBe('ok');
    }
  });
});

describe('indicator mapping', () => {
  it('drops the local instance id when sharing and regenerates one when restoring', () => {
    const instances = [
      { id: 'uuid-1', definitionId: 'ma', params: paramsOf('ma') },
      { id: 'uuid-2', definitionId: 'macd', params: paramsOf('macd') },
    ];

    const shared = toShareIndicators(instances);
    expect(shared).toEqual([
      { definitionId: 'ma', params: paramsOf('ma') },
      { definitionId: 'macd', params: paramsOf('macd') },
    ]);

    let seq = 0;
    const restored = toIndicatorInstances(shared, () => `restored-${++seq}`);
    expect(restored).toEqual([
      { id: 'restored-1', definitionId: 'ma', params: paramsOf('ma') },
      { id: 'restored-2', definitionId: 'macd', params: paramsOf('macd') },
    ]);
  });

  it('copies params so later edits do not leak across the boundary', () => {
    const instances = [{ id: 'uuid-1', definitionId: 'ma', params: paramsOf('ma') }];
    const shared = toShareIndicators(instances);

    instances[0].params.period = 999;

    expect(shared[0].params.period).toBe(20);
  });
});

describe('line mapping', () => {
  function drawnLine(overrides: Partial<DrawnLine> = {}): DrawnLine {
    return {
      id: 'line-1',
      points: [
        { time: '2024-01-02' as unknown as Time, price: 593.5 },
        { time: '2024-03-15' as unknown as Time, price: 780.25 },
      ],
      color: '#f5a623',
      width: 2,
      ...overrides,
    };
  }

  it('maps drawn lines to share lines', () => {
    expect(toShareLines([drawnLine()])).toEqual(STATE.lines);
  });

  it('skips lines that have no points yet', () => {
    expect(toShareLines([drawnLine({ points: null }), drawnLine({ id: 'line-2' })])).toHaveLength(1);
  });

  it('skips lines whose time cannot be encoded, keeping the rest', () => {
    const businessDay = { year: 2024, month: 1, day: 2 } as unknown as Time;
    const broken = drawnLine({
      id: 'line-2',
      points: [
        { time: businessDay, price: 1 },
        { time: '2024-03-15' as unknown as Time, price: 2 },
      ],
    });

    expect(toShareLines([broken, drawnLine()])).toEqual(STATE.lines);
  });

  it('keeps epoch-second times as numbers and rejects non-integer ones', () => {
    expect(toShareTime(1704153600 as unknown as Time)).toBe(1704153600);
    expect(toShareTime(1704153600.5 as unknown as Time)).toBeNull();
    expect(toShareTime('2024-01-02' as unknown as Time)).toBe('2024-01-02');
    expect(toShareTime('01/02/2024' as unknown as Time)).toBeNull();
  });

  it('converts a share line back into DrawingController.addLine points', () => {
    expect(toTrendLinePoints(STATE.lines[0])).toEqual([
      { time: '2024-01-02', price: 593.5 },
      { time: '2024-03-15', price: 780.25 },
    ]);
  });
});
