import { describe, expect, it } from 'vitest';
import { getIndicator } from './registry';
import { RocIndicator } from './roc';
import { closeBars, createFakeChart, isoDay } from './testFakeChart';

describe('RocIndicator', () => {
  it('registers itself into the indicator registry as "roc"', () => {
    expect(getIndicator('roc')).toBe(RocIndicator);
  });

  it('is a separate-pane indicator', () => {
    expect(RocIndicator.placement).toBe('separate-pane');
  });

  it('matches the hand-calculated n-day return', () => {
    // period=2：idx2 = (14-10)/10 × 100 = 40；idx3 = (16-12)/12 × 100 = 33.33…
    const points = RocIndicator.compute(closeBars([10, 12, 14, 16]), { period: 2 });

    expect(points).toHaveLength(2);
    expect(points[0].time).toBe(isoDay(2));
    expect(points[0].value).toBeCloseTo(40, 10);
    expect(points[1].value).toBeCloseTo((4 / 12) * 100, 10);
  });

  it('is 0 when the price is unchanged over the period', () => {
    expect(RocIndicator.compute(closeBars([10, 15, 10]), { period: 2 })).toEqual([
      { time: isoDay(2), value: 0 },
    ]);
  });

  it('is negative when the price is lower than n days ago', () => {
    expect(RocIndicator.compute(closeBars([20, 15, 10]), { period: 2 })[0].value).toBeCloseTo(-50, 10);
  });

  it('skips the first period bars (no comparison baseline)', () => {
    const data = closeBars([10, 11, 12, 13, 14, 15]);

    expect(RocIndicator.compute(data, { period: 4 })).toHaveLength(data.length - 4);
  });

  it('produces no points when there are not more bars than the period', () => {
    expect(RocIndicator.compute(closeBars([10, 12, 14]), { period: 3 })).toEqual([]);
  });

  it('mounts on an allocated pane with a 0 reference line and cleans up on dispose', () => {
    const fake = createFakeChart();
    const data = closeBars([10, 12, 14, 16]);

    const handle = RocIndicator.mount(fake.chart, fake.allocator, data, { period: 2, color: '#111111' });

    expect(fake.series[0].paneIndex).toBe(2);
    expect(fake.series[0].addOptions.color).toBe('#111111');
    expect(fake.series[0].priceLines.map((line) => line.price)).toEqual([0]);

    handle.update(data, { period: 2, color: '#222222' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#222222');

    handle.dispose();
    expect(fake.series[0].priceLines).toHaveLength(0);
    expect(fake.series[0].removed).toBe(true);
    expect(fake.releasedPanes).toEqual([2]);
  });
});
