import { describe, expect, it } from 'vitest';
import { wilderRma } from './movingAverage';
import { getIndicator } from './registry';
import { RsiIndicator } from './rsi';
import { closeBars, createFakeChart, isoDay } from './testFakeChart';

describe('RsiIndicator', () => {
  it('registers itself into the indicator registry as "rsi"', () => {
    expect(getIndicator('rsi')).toBe(RsiIndicator);
  });

  it('is a separate-pane indicator', () => {
    expect(RsiIndicator.placement).toBe('separate-pane');
  });

  it('returns 100 when the series only ever rises (no average loss)', () => {
    const points = RsiIndicator.compute(closeBars([10, 11, 12, 13, 14]), { period: 3 });

    expect(points).toEqual([
      { time: isoDay(3), value: 100 },
      { time: isoDay(4), value: 100 },
    ]);
  });

  it('returns 0 when the series only ever falls', () => {
    const points = RsiIndicator.compute(closeBars([14, 13, 12, 11, 10]), { period: 3 });

    expect(points.map((p) => p.value)).toEqual([0, 0]);
  });

  it('oscillates around 50 within 0–100 on an alternating series', () => {
    // 一漲一跌等幅交替：收在高點的日子 RSI 在 50 以上、收在低點的日子在 50 以下。
    const points = RsiIndicator.compute(closeBars([10, 12, 10, 12, 10, 12, 10, 12]), { period: 2 });

    expect(points.length).toBeGreaterThan(1);
    expect(points.some((point) => point.value > 50)).toBe(true);
    expect(points.some((point) => point.value < 50)).toBe(true);
    for (const point of points) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });

  it('cross-checks against an independently written Wilder RSI on a non-trivial series', () => {
    const closes = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03];
    const period = 5;

    const gains: number[] = [];
    const losses: number[] = [];
    for (let i = 1; i < closes.length; i += 1) {
      const change = closes[i] - closes[i - 1];
      gains.push(Math.max(change, 0));
      losses.push(Math.max(-change, 0));
    }
    const avgGains = wilderRma(gains, period);
    const avgLosses = wilderRma(losses, period);
    const expected = avgGains.map((gain, i) => 100 - 100 / (1 + gain / avgLosses[i]));

    const points = RsiIndicator.compute(closeBars(closes), { period });

    expect(points).toHaveLength(expected.length);
    points.forEach((point, i) => {
      expect(point.time).toBe(isoDay(period + i));
      expect(point.value).toBeCloseTo(expected[i], 10);
    });
  });

  it('needs period + 1 bars for its first point', () => {
    expect(RsiIndicator.compute(closeBars([10, 11, 12]), { period: 3 })).toEqual([]);
    expect(RsiIndicator.compute(closeBars([10, 11, 12, 13]), { period: 3 })).toHaveLength(1);
  });

  it('defaults to a 14-day period', () => {
    expect(RsiIndicator.compute(closeBars(Array.from({ length: 15 }, (_, i) => 100 + i)), {})).toHaveLength(1);
  });

  it('mounts on an allocated pane with 30/70 reference lines and cleans up on dispose', () => {
    const fake = createFakeChart();
    const data = closeBars([10, 12, 11, 13, 12, 14, 13, 15]);

    const handle = RsiIndicator.mount(fake.chart, fake.allocator, data, { period: 3, color: '#111111' });

    expect(fake.series).toHaveLength(1);
    expect(fake.series[0].paneIndex).toBe(2);
    expect(fake.series[0].addOptions.color).toBe('#111111');
    expect(fake.series[0].priceLines.map((line) => line.price)).toEqual([30, 70]);

    handle.update(data, { period: 3, color: '#222222' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#222222');

    handle.dispose();
    expect(fake.series[0].priceLines).toHaveLength(0);
    expect(fake.series[0].removed).toBe(true);
    expect(fake.releasedPanes).toEqual([2]);
  });
});
