import { describe, expect, it } from 'vitest';
import { BiasIndicator } from './bias';
import { getIndicator } from './registry';
import { closeBars, createFakeChart, isoDay } from './testFakeChart';

describe('BiasIndicator', () => {
  it('registers itself into the indicator registry as "bias"', () => {
    expect(getIndicator('bias')).toBe(BiasIndicator);
  });

  it('is a separate-pane indicator', () => {
    expect(BiasIndicator.placement).toBe('separate-pane');
  });

  it('matches a hand-calculated deviation percentage', () => {
    // 視窗 [10,12,14]：SMA=12 → (14-12)/12 × 100 = 16.666…
    const points = BiasIndicator.compute(closeBars([10, 12, 14]), { period: 3 });

    expect(points).toHaveLength(1);
    expect(points[0].time).toBe(isoDay(2));
    expect(points[0].value).toBeCloseTo((2 / 12) * 100, 10);
  });

  it('is exactly 0 when the close sits on its moving average', () => {
    expect(BiasIndicator.compute(closeBars([10, 10, 10]), { period: 3 })).toEqual([
      { time: isoDay(2), value: 0 },
    ]);
  });

  it('is negative when the close is below its moving average', () => {
    expect(BiasIndicator.compute(closeBars([14, 12, 10]), { period: 3 })[0].value).toBeLessThan(0);
  });

  it('widens as the close pulls further away from the average', () => {
    const mild = BiasIndicator.compute(closeBars([10, 10, 11]), { period: 3 })[0].value;
    const extreme = BiasIndicator.compute(closeBars([10, 10, 20]), { period: 3 })[0].value;

    expect(extreme).toBeGreaterThan(mild);
  });

  it('produces no points when there are fewer bars than the period', () => {
    expect(BiasIndicator.compute(closeBars([10, 12]), { period: 10 })).toEqual([]);
  });

  it('mounts on an allocated pane with a 0 reference line and cleans up on dispose', () => {
    const fake = createFakeChart();
    const data = closeBars([10, 12, 14, 11]);

    const handle = BiasIndicator.mount(fake.chart, fake.allocator, data, { period: 3, color: '#111111' });

    expect(fake.series[0].paneIndex).toBe(2);
    expect(fake.series[0].addOptions.color).toBe('#111111');
    expect(fake.series[0].priceLines.map((line) => line.price)).toEqual([0]);

    handle.update(data, { period: 3, color: '#222222' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#222222');

    handle.dispose();
    expect(fake.series[0].priceLines).toHaveLength(0);
    expect(fake.series[0].removed).toBe(true);
    expect(fake.releasedPanes).toEqual([2]);
  });
});
