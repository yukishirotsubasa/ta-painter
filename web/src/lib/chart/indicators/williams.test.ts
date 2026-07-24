import { describe, expect, it } from 'vitest';
import { KdIndicator } from './kd';
import { getIndicator } from './registry';
import { closeBars, createFakeChart, isoDay } from './testFakeChart';
import { WilliamsIndicator } from './williams';

describe('WilliamsIndicator', () => {
  it('registers itself into the indicator registry as "williams"', () => {
    expect(getIndicator('williams')).toBe(WilliamsIndicator);
  });

  it('is a separate-pane indicator', () => {
    expect(WilliamsIndicator.placement).toBe('separate-pane');
  });

  it('returns 0 when the close sits at the window high and -100 at the window low', () => {
    expect(WilliamsIndicator.compute(closeBars([10, 12, 14]), { period: 3 })).toEqual([
      { time: isoDay(2), value: -0 },
    ]);
    expect(WilliamsIndicator.compute(closeBars([14, 12, 10]), { period: 3 })).toEqual([
      { time: isoDay(2), value: -100 },
    ]);
  });

  it('matches a hand-calculated mid-range value', () => {
    // 視窗 [10,12,11]：最高 12、最低 10、收 11 → (12-11)/2 × -100 = -50。
    expect(WilliamsIndicator.compute(closeBars([10, 12, 11]), { period: 3 })).toEqual([
      { time: isoDay(2), value: -50 },
    ]);
  });

  it('stays within the -100 ~ 0 range on a volatile series', () => {
    const points = WilliamsIndicator.compute(closeBars([10, 30, 12, 45, 8, 40, 15, 50, 9, 35]), {
      period: 4,
    });

    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      expect(point.value).toBeGreaterThanOrEqual(-100);
      expect(point.value).toBeLessThanOrEqual(0);
    }
  });

  it('is the mirror of the KD RSV (%R = RSV - 100)', () => {
    // KD 的 K 是平滑過的，但 kPeriod=1 時 K 就等於當根 RSV。
    const data = closeBars([10, 30, 12, 45, 8, 40, 15, 50, 9, 35]);

    const williams = WilliamsIndicator.compute(data, { period: 4 });
    const rsv = KdIndicator.compute(data, { rsvPeriod: 4, kPeriod: 1, dPeriod: 1 });

    expect(williams).toHaveLength(rsv.length);
    williams.forEach((point, i) => {
      expect(point.value).toBeCloseTo(rsv[i].k - 100, 10);
    });
  });

  it('takes the neutral -50 when the window has no range', () => {
    expect(WilliamsIndicator.compute(closeBars([10, 10, 10]), { period: 3 })).toEqual([
      { time: isoDay(2), value: -50 },
    ]);
  });

  it('produces no points when there are fewer bars than the period', () => {
    expect(WilliamsIndicator.compute(closeBars([10, 12]), { period: 14 })).toEqual([]);
  });

  it('mounts on an allocated pane with -20/-80 reference lines and cleans up on dispose', () => {
    const fake = createFakeChart();
    const data = closeBars([10, 30, 12, 45, 8]);

    const handle = WilliamsIndicator.mount(fake.chart, fake.allocator, data, {
      period: 3,
      color: '#111111',
    });

    expect(fake.series[0].paneIndex).toBe(2);
    expect(fake.series[0].addOptions.color).toBe('#111111');
    expect(fake.series[0].priceLines.map((line) => line.price)).toEqual([-20, -80]);

    handle.update(data, { period: 3, color: '#222222' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#222222');

    handle.dispose();
    expect(fake.series[0].priceLines).toHaveLength(0);
    expect(fake.series[0].removed).toBe(true);
    expect(fake.releasedPanes).toEqual([2]);
  });
});
