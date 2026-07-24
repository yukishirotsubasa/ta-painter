import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { UP_COLOR, DOWN_COLOR } from '../colors';
import { getIndicator } from './registry';
import { SarIndicator } from './sar';
import { createFakeChart, isoDay } from './testFakeChart';

function ohlcBars(rows: Array<[high: number, low: number, close: number]>): OhlcvBar[] {
  return rows.map(([high, low, close], i) => ({
    time: isoDay(i),
    open: close,
    high,
    low,
    close,
    volume: 1,
  }));
}

const RISING = ohlcBars(Array.from({ length: 12 }, (_, i) => [12 + i, 10 + i, 11 + i]));

describe('SarIndicator', () => {
  it('registers itself into the indicator registry as "sar"', () => {
    expect(getIndicator('sar')).toBe(SarIndicator);
  });

  it('is an overlay indicator drawn on the price pane', () => {
    expect(SarIndicator.placement).toBe('overlay');
  });

  it('stays long and below the bars throughout a clean uptrend', () => {
    const points = SarIndicator.compute(RISING, {});

    expect(points).toHaveLength(RISING.length - 2);
    points.forEach((point, i) => {
      const bar = RISING[i + 2];
      expect(point.isLong).toBe(true);
      expect(point.value).toBeLessThanOrEqual(bar.low);
      expect(point.time).toBe(bar.time);
    });
  });

  it('stays short and above the bars throughout a clean downtrend', () => {
    const falling = ohlcBars(Array.from({ length: 12 }, (_, i) => [40 - i, 38 - i, 39 - i]));

    for (const [i, point] of SarIndicator.compute(falling, {}).entries()) {
      expect(point.isLong).toBe(false);
      expect(point.value).toBeGreaterThanOrEqual(falling[i + 2].high);
    }
  });

  it('flips from long to short when price breaks below the stop', () => {
    // 先漲一段，再暴跌把 SAR 打穿。
    const reversing = ohlcBars([
      ...Array.from({ length: 8 }, (_, i) => [12 + i, 10 + i, 11 + i] as [number, number, number]),
      [6, 4, 5],
      [5, 3, 4],
    ]);

    const points = SarIndicator.compute(reversing, {});

    expect(points.at(-1)!.isLong).toBe(false);
    expect(points.some((point) => point.isLong)).toBe(true);
  });

  it('accelerates faster with a larger step (SAR trails closer to price)', () => {
    const slow = SarIndicator.compute(RISING, { step: 0.02, maxStep: 0.2 }).at(-1)!.value;
    const fast = SarIndicator.compute(RISING, { step: 0.1, maxStep: 0.5 }).at(-1)!.value;

    expect(fast).toBeGreaterThan(slow);
  });

  it('needs at least three bars (the first two seed direction and stop)', () => {
    expect(SarIndicator.compute(RISING.slice(0, 2), {})).toEqual([]);
    expect(SarIndicator.compute(RISING.slice(0, 3), {})).toHaveLength(1);
  });

  it('renders as coloured dots on the price pane without a connecting line', () => {
    const fake = createFakeChart();

    SarIndicator.mount(fake.chart, fake.allocator, RISING, {});

    expect(fake.series).toHaveLength(1);
    expect(fake.series[0].paneIndex).toBe(0);
    expect(fake.series[0].addOptions.lineVisible).toBe(false);
    expect(fake.series[0].addOptions.pointMarkersVisible).toBe(true);
    expect(fake.allocateCount()).toBe(0);

    const data = fake.series[0].lastData as Array<{ color: string }>;
    expect(data.every((point) => point.color === UP_COLOR)).toBe(true);
  });

  it('colours each point by trend direction using the shared up/down colours', () => {
    const fake = createFakeChart();
    const reversing = ohlcBars([
      ...Array.from({ length: 8 }, (_, i) => [12 + i, 10 + i, 11 + i] as [number, number, number]),
      [6, 4, 5],
      [5, 3, 4],
    ]);

    const handle = SarIndicator.mount(fake.chart, fake.allocator, reversing, {});
    handle.update(reversing, {});

    const data = fake.series[0].lastData as Array<{ color: string }>;
    expect(data.some((point) => point.color === UP_COLOR)).toBe(true);
    expect(data.some((point) => point.color === DOWN_COLOR)).toBe(true);

    handle.dispose();
    expect(fake.series[0].removed).toBe(true);
  });
});
