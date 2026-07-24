import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { EmaIndicator } from './ema';
import { ema } from './movingAverage';
import { getIndicator } from './registry';
import { closeBars, createFakeChart, isoDay } from './testFakeChart';

describe('EmaIndicator', () => {
  it('registers itself into the indicator registry as "ema"', () => {
    expect(getIndicator('ema')).toBe(EmaIndicator);
  });

  it('uses a distinct url code from MA so shared links stay unambiguous', () => {
    expect(EmaIndicator.urlCode).toBe('em');
    expect(EmaIndicator.urlCode).not.toBe(getIndicator('ma')?.urlCode);
  });

  it('matches the shared ema() helper and aligns the first point to bars[period - 1]', () => {
    const closes = [10, 12, 14, 16, 18];
    const points = EmaIndicator.compute(closeBars(closes), { period: 2 });

    expect(points).toEqual(ema(closes, 2).map((value, i) => ({ time: isoDay(1 + i), value })));
  });

  it('weights recent bars more heavily than SMA does after a jump', () => {
    // 前四天持平、第五天跳空，EMA 應比同週期 SMA 更貼近新價。
    const data = closeBars([10, 10, 10, 10, 20]);

    const emaLast = EmaIndicator.compute(data, { period: 4 }).at(-1)?.value ?? 0;
    const smaLast = (10 + 10 + 10 + 20) / 4;

    expect(emaLast).toBeGreaterThan(smaLast);
  });

  it('produces no points when there are fewer bars than the period', () => {
    expect(EmaIndicator.compute(closeBars([10, 12]), { period: 5 })).toEqual([]);
  });

  it('computes on params.source instead of close', () => {
    const data: OhlcvBar[] = [
      { time: isoDay(0), open: 1, high: 1, low: 1, close: 1, volume: 100 },
      { time: isoDay(1), open: 2, high: 2, low: 2, close: 2, volume: 200 },
    ];

    expect(EmaIndicator.compute(data, { period: 2, source: 'volume' })).toEqual([
      { time: isoDay(1), value: 150 },
    ]);
  });

  it('mounts price sources on the price pane and volume on the volume pane', () => {
    const priceChart = createFakeChart();
    EmaIndicator.mount(priceChart.chart, priceChart.allocator, closeBars([10, 12]), { period: 2 });
    expect(priceChart.series[0].paneIndex).toBe(0);
    expect(priceChart.series[0].addOptions.priceFormat).toEqual({ type: 'price' });

    const volumeChart = createFakeChart();
    EmaIndicator.mount(volumeChart.chart, volumeChart.allocator, closeBars([10, 12]), {
      period: 2,
      source: 'volume',
    });
    expect(volumeChart.series[0].paneIndex).toBe(1);
    expect(volumeChart.series[0].addOptions.priceFormat).toEqual({ type: 'volume' });
  });

  it('applies the color param on mount and on update', () => {
    const fake = createFakeChart();
    const data = closeBars([10, 12]);

    const handle = EmaIndicator.mount(fake.chart, fake.allocator, data, { period: 2, color: '#111111' });
    expect(fake.series[0].addOptions.color).toBe('#111111');

    handle.update(data, { period: 2, color: '#222222' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#222222');
  });
});
