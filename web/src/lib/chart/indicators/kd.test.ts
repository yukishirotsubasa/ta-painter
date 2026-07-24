import { describe, expect, it } from 'vitest';
import { KdIndicator } from './kd';
import { getIndicator } from './registry';
import { closeBars, createFakeChart, isoDay } from './testFakeChart';

describe('KdIndicator', () => {
  it('registers itself into the indicator registry as "kd"', () => {
    expect(getIndicator('kd')).toBe(KdIndicator);
  });

  it('is a separate-pane indicator', () => {
    expect(KdIndicator.placement).toBe('separate-pane');
  });

  it('matches hand-calculated RSV/K/D with K and D seeded at 50', () => {
    // rsvPeriod=3：idx2 視窗 [10,12,14] → 最高 14、最低 10、收 14 → RSV = 100。
    //   K = 50×2/3 + 100/3 = 200/3；D = 50×2/3 + K/3。
    // idx3 視窗 [12,14,11] → 最高 14、最低 11、收 11 → RSV = 0。
    //   K = (200/3)×2/3；D = 前D×2/3 + K/3。
    const points = KdIndicator.compute(closeBars([10, 12, 14, 11]), {
      rsvPeriod: 3,
      kPeriod: 3,
      dPeriod: 3,
    });

    const k0 = 200 / 3;
    const d0 = (50 * 2) / 3 + k0 / 3;
    const k1 = (k0 * 2) / 3;
    const d1 = (d0 * 2) / 3 + k1 / 3;

    expect(points).toHaveLength(2);
    expect(points[0].time).toBe(isoDay(2));
    expect(points[0].k).toBeCloseTo(k0, 10);
    expect(points[0].d).toBeCloseTo(d0, 10);
    expect(points[1].time).toBe(isoDay(3));
    expect(points[1].k).toBeCloseTo(k1, 10);
    expect(points[1].d).toBeCloseTo(d1, 10);
  });

  it('stays at the neutral 50 when the window has no range at all', () => {
    const points = KdIndicator.compute(closeBars([10, 10, 10, 10]), {
      rsvPeriod: 3,
      kPeriod: 3,
      dPeriod: 3,
    });

    for (const point of points) {
      expect(point.k).toBeCloseTo(50, 10);
      expect(point.d).toBeCloseTo(50, 10);
    }
  });

  it('keeps K and D inside 0–100 on a volatile series', () => {
    const points = KdIndicator.compute(closeBars([10, 30, 12, 45, 8, 40, 15, 50, 9, 35]), {});

    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      expect(point.k).toBeGreaterThanOrEqual(0);
      expect(point.k).toBeLessThanOrEqual(100);
      expect(point.d).toBeGreaterThanOrEqual(0);
      expect(point.d).toBeLessThanOrEqual(100);
    }
  });

  it('reacts faster on K than on D (D is a further smoothing of K)', () => {
    // 一路上漲 → RSV 貼近 100，K 追得比 D 快。
    const points = KdIndicator.compute(closeBars([10, 11, 12, 13, 14, 15, 16, 17]), { rsvPeriod: 3 });

    expect(points.at(-1)!.k).toBeGreaterThan(points.at(-1)!.d);
  });

  it('produces no points when there are fewer bars than the RSV period', () => {
    expect(KdIndicator.compute(closeBars([10, 12]), { rsvPeriod: 9 })).toEqual([]);
  });

  it('mounts K and D on one allocated pane with 20/80 reference lines, and cleans up on dispose', () => {
    const fake = createFakeChart();
    const data = closeBars([10, 30, 12, 45, 8, 40, 15, 50, 9, 35]);

    const handle = KdIndicator.mount(fake.chart, fake.allocator, data, {
      kColor: '#111111',
      dColor: '#222222',
    });

    expect(fake.series).toHaveLength(2);
    expect(fake.series.map((s) => s.paneIndex)).toEqual([2, 2]);
    expect(fake.series[0].addOptions.color).toBe('#111111');
    expect(fake.series[1].addOptions.color).toBe('#222222');
    expect(fake.series[0].priceLines.map((line) => line.price)).toEqual([20, 80]);

    handle.update(data, { kColor: '#333333', dColor: '#444444' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#333333');
    expect(fake.series[1].applied.at(-1)?.color).toBe('#444444');

    handle.dispose();
    expect(fake.series[0].priceLines).toHaveLength(0);
    expect(fake.series.every((s) => s.removed)).toBe(true);
    expect(fake.releasedPanes).toEqual([2]);
  });
});
