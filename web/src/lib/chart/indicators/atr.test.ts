import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { AtrIndicator, trueRange } from './atr';
import { getIndicator } from './registry';
import { closeBars, createFakeChart, isoDay } from './testFakeChart';

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

describe('trueRange', () => {
  it('falls back to the high-low range on the first bar (no previous close)', () => {
    expect(trueRange(ohlcBars([[12, 10, 11]]))).toEqual([2]);
  });

  it('takes the largest of high-low, |high - prevClose| and |low - prevClose|', () => {
    // 第二根：高低差 1、跳空向上（高 − 前收 = 20 − 11 = 9）→ 取 9。
    // 第三根：高低差 1、跳空向下（|低 − 前收| = |5 − 20| = 15）→ 取 15。
    const values = trueRange(
      ohlcBars([
        [12, 10, 11],
        [20, 19, 20],
        [6, 5, 5],
      ]),
    );

    expect(values).toEqual([2, 9, 15]);
  });
});

describe('AtrIndicator', () => {
  it('registers itself into the indicator registry as "atr"', () => {
    expect(getIndicator('atr')).toBe(AtrIndicator);
  });

  it('is a separate-pane indicator', () => {
    expect(AtrIndicator.placement).toBe('separate-pane');
  });

  it('matches a hand-calculated Wilder smoothing of the true range', () => {
    // 高=低=收 → TR = [0, 2, 2, 2]；period=2 → 種子 avg(0,2)=1、之後 1+(2-1)/2=1.5、1.5+(2-1.5)/2=1.75。
    const points = AtrIndicator.compute(closeBars([10, 12, 14, 16]), { period: 2 });

    expect(points).toEqual([
      { time: isoDay(1), value: 1 },
      { time: isoDay(2), value: 1.5 },
      { time: isoDay(3), value: 1.75 },
    ]);
  });

  it('is never negative and rises when volatility rises', () => {
    const calm = AtrIndicator.compute(ohlcBars(Array.from({ length: 10 }, () => [11, 10, 10.5])), {
      period: 3,
    });
    const wild = AtrIndicator.compute(ohlcBars(Array.from({ length: 10 }, () => [20, 5, 12])), {
      period: 3,
    });

    expect(calm.every((point) => point.value >= 0)).toBe(true);
    expect(wild.at(-1)!.value).toBeGreaterThan(calm.at(-1)!.value);
  });

  it('produces no points when there are fewer bars than the period', () => {
    expect(AtrIndicator.compute(closeBars([10, 12]), { period: 5 })).toEqual([]);
  });

  it('mounts on an allocated pane and releases it on dispose', () => {
    const fake = createFakeChart();
    const data = closeBars([10, 12, 14, 16]);

    const handle = AtrIndicator.mount(fake.chart, fake.allocator, data, { period: 2, color: '#111111' });
    expect(fake.series[0].paneIndex).toBe(2);
    expect(fake.series[0].addOptions.color).toBe('#111111');

    handle.update(data, { period: 2, color: '#222222' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#222222');

    handle.dispose();
    expect(fake.series[0].removed).toBe(true);
    expect(fake.releasedPanes).toEqual([2]);
  });
});
