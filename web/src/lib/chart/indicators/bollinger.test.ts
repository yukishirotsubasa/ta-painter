import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { DEFAULT_LINE_COLOR } from '../colors';
import { getIndicator } from './registry';
import { BollingerIndicator } from './bollinger';

function bar(time: string, close: number): OhlcvBar {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

interface FakeSeries {
  addOptions: Record<string, unknown>;
  applied: Array<Record<string, unknown>>;
}

/** 每次 addSeries 回傳獨立的 fake series，依掛載順序記錄於 series 陣列（上/中/下軌）。 */
function fakeChart(): { chart: unknown; allocator: PaneAllocator; series: FakeSeries[] } {
  const series: FakeSeries[] = [];
  const chart = {
    addSeries: (_series: unknown, options: Record<string, unknown>) => {
      const record: FakeSeries = { addOptions: options, applied: [] };
      series.push(record);
      return {
        setData: () => {},
        applyOptions: (opts: Record<string, unknown>) => record.applied.push(opts),
      };
    },
    removeSeries: () => {},
  };
  return { chart, allocator: { allocate: () => 0, release: () => {} }, series };
}

interface PaneAllocator {
  allocate: () => number;
  release: () => void;
}

describe('BollingerIndicator', () => {
  it('registers itself into the indicator registry as "bollinger"', () => {
    expect(getIndicator('bollinger')).toBe(BollingerIndicator);
  });

  it('computes SMA middle band and ± k*stddev upper/lower bands, skipping days with insufficient history', () => {
    const bars = [
      bar('2024-01-01', 10),
      bar('2024-01-02', 12),
      bar('2024-01-03', 14),
      bar('2024-01-04', 16),
      bar('2024-01-05', 18),
    ];

    const points = BollingerIndicator.compute(bars, { period: 3, stdDevMultiplier: 2 });

    // window [10,12,14]: mean=12, population variance=((10-12)^2+(12-12)^2+(14-12)^2)/3=8/3
    const stdDev = Math.sqrt(8 / 3);
    expect(points).toHaveLength(3);
    expect(points[0].time).toBe('2024-01-03');
    expect(points[0].middle).toBeCloseTo(12, 10);
    expect(points[0].upper).toBeCloseTo(12 + 2 * stdDev, 10);
    expect(points[0].lower).toBeCloseTo(12 - 2 * stdDev, 10);

    // window [12,14,16]: mean=14, same variance shape -> same stdDev
    expect(points[1].time).toBe('2024-01-04');
    expect(points[1].middle).toBeCloseTo(14, 10);
    expect(points[1].upper).toBeCloseTo(14 + 2 * stdDev, 10);
    expect(points[1].lower).toBeCloseTo(14 - 2 * stdDev, 10);

    // window [14,16,18]: mean=16
    expect(points[2].time).toBe('2024-01-05');
    expect(points[2].middle).toBeCloseTo(16, 10);
    expect(points[2].upper).toBeCloseTo(16 + 2 * stdDev, 10);
    expect(points[2].lower).toBeCloseTo(16 - 2 * stdDev, 10);
  });

  it('matches bands hand-calculated from real published TWSE close prices (2330, 2024-09)', () => {
    // 收盤價取自 twseProvider.test.ts 的 REAL_STOCK_DAY_RESPONSE（113/09/02 ~ 113/09/06）。
    const closes = [948, 940, 889, 902, 918];
    const bars = [
      bar('2024-09-02', closes[0]),
      bar('2024-09-03', closes[1]),
      bar('2024-09-04', closes[2]),
      bar('2024-09-05', closes[3]),
      bar('2024-09-06', closes[4]),
    ];

    const points = BollingerIndicator.compute(bars, { period: 5, stdDevMultiplier: 2 });

    const mean = closes.reduce((a, b) => a + b, 0) / 5;
    const variance = closes.reduce((acc, c) => acc + (c - mean) ** 2, 0) / 5;
    const stdDev = Math.sqrt(variance);

    expect(points).toEqual([
      { time: '2024-09-06', middle: mean, upper: mean + 2 * stdDev, lower: mean - 2 * stdDev },
    ]);
  });

  it('produces no points when there are fewer bars than the period', () => {
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12)];

    expect(BollingerIndicator.compute(bars, { period: 5 })).toEqual([]);
  });

  it('defaults to a 20-day period and ×2 std dev multiplier when params are not provided', () => {
    const bars = Array.from({ length: 20 }, (_, i) => bar(`2024-01-${String(i + 1).padStart(2, '0')}`, 100));

    const points = BollingerIndicator.compute(bars, {});

    expect(points).toHaveLength(1);
    // All closes are 100 -> zero variance -> upper/middle/lower collapse to 100.
    expect(points[0]).toEqual({ time: '2024-01-20', middle: 100, upper: 100, lower: 100 });
  });

  it('widens the bands when stdDevMultiplier increases, with the middle band unchanged', () => {
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 20), bar('2024-01-03', 10)];

    const narrow = BollingerIndicator.compute(bars, { period: 3, stdDevMultiplier: 1 });
    const wide = BollingerIndicator.compute(bars, { period: 3, stdDevMultiplier: 3 });

    expect(narrow[0].middle).toBe(wide[0].middle);
    expect(wide[0].upper).toBeGreaterThan(narrow[0].upper);
    expect(wide[0].lower).toBeLessThan(narrow[0].lower);
  });

  it('exposes upper/middle/lower color params in its schema', () => {
    const keys = BollingerIndicator.paramsSchema.map((s) => s.key);
    expect(keys).toEqual(['period', 'stdDevMultiplier', 'upperColor', 'middleColor', 'lowerColor']);

    for (const key of ['upperColor', 'middleColor', 'lowerColor']) {
      const schema = BollingerIndicator.paramsSchema.find((s) => s.key === key);
      expect(schema?.type).toBe('color');
      expect(schema && 'default' in schema && schema.default).toBe(DEFAULT_LINE_COLOR);
    }
  });

  it('applies per-band colors on mount and update, defaulting unspecified bands to the shared line color', () => {
    const fake = fakeChart();
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12), bar('2024-01-03', 14)];

    const handle = BollingerIndicator.mount(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fake.chart as any,
      fake.allocator,
      bars,
      { period: 2, upperColor: '#111111', middleColor: '#222222' },
    );

    // series[0]=upper, series[1]=middle, series[2]=lower（掛載順序）。
    expect(fake.series[0].applied.at(-1)?.color).toBe('#111111');
    expect(fake.series[1].applied.at(-1)?.color).toBe('#222222');
    expect(fake.series[2].applied.at(-1)?.color).toBe(DEFAULT_LINE_COLOR);

    handle.update(bars, { period: 2, lowerColor: '#333333' });
    expect(fake.series[0].applied.at(-1)?.color).toBe(DEFAULT_LINE_COLOR);
    expect(fake.series[2].applied.at(-1)?.color).toBe('#333333');
  });
});
