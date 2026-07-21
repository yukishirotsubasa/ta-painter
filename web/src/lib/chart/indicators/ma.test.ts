import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { getIndicator } from './registry';
import { MaIndicator } from './ma';

function bar(time: string, close: number): OhlcvBar {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

describe('MaIndicator', () => {
  it('registers itself into the indicator registry as "ma"', () => {
    expect(getIndicator('ma')).toBe(MaIndicator);
  });

  it('computes a simple moving average matching hand-calculated values, skipping days with insufficient history', () => {
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12), bar('2024-01-03', 14), bar('2024-01-04', 16)];

    const points = MaIndicator.compute(bars, { period: 3 });

    // MA3 needs 3 days of history: day1/2 have none, day3 = (10+12+14)/3, day4 = (12+14+16)/3.
    expect(points).toEqual([
      { time: '2024-01-03', value: 12 },
      { time: '2024-01-04', value: 14 },
    ]);
  });

  it('matches MA5 hand-calculated from real published TWSE close prices (2330, 2024-09)', () => {
    // 收盤價取自 twseProvider.test.ts 的 REAL_STOCK_DAY_RESPONSE（113/09/02 ~ 113/09/06）。
    const bars = [
      bar('2024-09-02', 948),
      bar('2024-09-03', 940),
      bar('2024-09-04', 889),
      bar('2024-09-05', 902),
      bar('2024-09-06', 918),
    ];

    const points = MaIndicator.compute(bars, { period: 5 });

    const expectedMa5 = (948 + 940 + 889 + 902 + 918) / 5;
    expect(points).toEqual([{ time: '2024-09-06', value: expectedMa5 }]);
  });

  it('produces no points when there are fewer bars than the period', () => {
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12)];

    expect(MaIndicator.compute(bars, { period: 5 })).toEqual([]);
  });

  it('computes independently for different periods (MA5 vs MA20 do not interfere)', () => {
    const bars = Array.from({ length: 25 }, (_, i) => bar(`2024-01-${String(i + 1).padStart(2, '0')}`, i + 1));

    const ma5 = MaIndicator.compute(bars, { period: 5 });
    const ma20 = MaIndicator.compute(bars, { period: 20 });

    expect(ma5).toHaveLength(21);
    expect(ma20).toHaveLength(6);
    expect(ma5[0]).toEqual({ time: '2024-01-05', value: 3 });
    expect(ma20[0]).toEqual({ time: '2024-01-20', value: 10.5 });
  });

  it('defaults to a 20-day period when params.period is not provided', () => {
    const bars = Array.from({ length: 20 }, (_, i) => bar(`2024-01-${String(i + 1).padStart(2, '0')}`, 100));

    expect(MaIndicator.compute(bars, {})).toHaveLength(1);
  });
});
