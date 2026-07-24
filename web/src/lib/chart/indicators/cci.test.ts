import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { CciIndicator } from './cci';
import { getIndicator } from './registry';
import { closeBars, createFakeChart, isoDay } from './testFakeChart';

describe('CciIndicator', () => {
  it('registers itself into the indicator registry as "cci"', () => {
    expect(getIndicator('cci')).toBe(CciIndicator);
  });

  it('is a separate-pane indicator', () => {
    expect(CciIndicator.placement).toBe('separate-pane');
  });

  it('matches a hand-calculated CCI (high=low=close so TP equals close)', () => {
    // 視窗 [10,12,14]：SMA=12，平均絕對偏差=(2+0+2)/3=4/3，
    // CCI = (14-12) / (0.015 × 4/3) = 2 / 0.02 = 100。
    const points = CciIndicator.compute(closeBars([10, 12, 14]), { period: 3 });

    expect(points).toHaveLength(1);
    expect(points[0].time).toBe(isoDay(2));
    expect(points[0].value).toBeCloseTo(100, 10);
  });

  it('uses the typical price (high + low + close) / 3 rather than close alone', () => {
    const withWideRange: OhlcvBar[] = [
      { time: isoDay(0), open: 10, high: 16, low: 10, close: 10, volume: 1 },
      { time: isoDay(1), open: 12, high: 12, low: 12, close: 12, volume: 1 },
      { time: isoDay(2), open: 14, high: 14, low: 14, close: 14, volume: 1 },
    ];

    expect(CciIndicator.compute(withWideRange, { period: 3 })).not.toEqual(
      CciIndicator.compute(closeBars([10, 12, 14]), { period: 3 }),
    );
  });

  it('returns 0 when the window is perfectly flat (zero mean deviation)', () => {
    const points = CciIndicator.compute(closeBars([10, 10, 10, 10]), { period: 3 });

    expect(points.map((point) => point.value)).toEqual([0, 0]);
  });

  it('is positive above the mean and negative below it', () => {
    const rising = CciIndicator.compute(closeBars([10, 12, 14]), { period: 3 });
    const falling = CciIndicator.compute(closeBars([14, 12, 10]), { period: 3 });

    expect(rising[0].value).toBeGreaterThan(0);
    expect(falling[0].value).toBeLessThan(0);
  });

  it('produces no points when there are fewer bars than the period', () => {
    expect(CciIndicator.compute(closeBars([10, 12]), { period: 20 })).toEqual([]);
  });

  it('mounts on an allocated pane with ±100 reference lines and cleans up on dispose', () => {
    const fake = createFakeChart();
    const data = closeBars([10, 12, 14, 11, 15]);

    const handle = CciIndicator.mount(fake.chart, fake.allocator, data, { period: 3, color: '#111111' });

    expect(fake.series[0].paneIndex).toBe(2);
    expect(fake.series[0].addOptions.color).toBe('#111111');
    expect(fake.series[0].priceLines.map((line) => line.price)).toEqual([-100, 100]);

    handle.update(data, { period: 3, color: '#222222' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#222222');

    handle.dispose();
    expect(fake.series[0].priceLines).toHaveLength(0);
    expect(fake.series[0].removed).toBe(true);
    expect(fake.releasedPanes).toEqual([2]);
  });
});
