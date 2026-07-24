import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { HeadBottomIndicator, toHeadBottomMarkers, type HeadBottomPoint } from './headBottom';
import { getIndicator } from './registry';
import { createFakeChart, isoDay } from './testFakeChart';

/** 高 = 收 + 1、低 = 收 − 1，讓「頭取最高價、底取最低價」與收盤價明確區分開。 */
function bars(closes: number[]): OhlcvBar[] {
  return closes.map((close, i) => ({
    time: isoDay(i),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1,
  }));
}

/**
 * period=3 的手算基準序列。
 *
 * idx    0   1   2   3   4   5   6   7   8   9
 * close 10  10  10  13  14  15   9   8   7  12
 * ma3    -   -  10  11  12.33 14 12.67 10.67 8   9
 * above  -   -   ✗   ✓   ✓   ✓   ✗   ✗   ✗   ✓
 *
 * → 突破點：idx3 向上、idx6 向下、idx9 向上。
 *   idx3 向上 → 上個區間 [2, 2]，底 = low(idx2) = 9
 *   idx6 向下 → 上個區間 [3, 5]，頭 = max high = high(idx5) = 16
 *   idx9 向上 → 上個區間 [6, 8]，底 = min low = low(idx8) = 6
 *   idx9 之後的區間尚未被下一次突破確認，不輸出。
 */
const BASE_CLOSES = [10, 10, 10, 13, 14, 15, 9, 8, 7, 12];

const EXPECTED: HeadBottomPoint[] = [
  { time: isoDay(2), price: 9, kind: 'bottom' },
  { time: isoDay(5), price: 16, kind: 'head' },
  { time: isoDay(8), price: 6, kind: 'bottom' },
];

describe('HeadBottomIndicator.compute', () => {
  it('registers itself into the indicator registry as "headBottom"', () => {
    expect(getIndicator('headBottom')).toBe(HeadBottomIndicator);
  });

  it('is an overlay indicator drawn on the price pane', () => {
    expect(HeadBottomIndicator.placement).toBe('overlay');
  });

  it('marks the lowest low before an upward cross as 底 and the highest high before a downward cross as 頭', () => {
    expect(HeadBottomIndicator.compute(bars(BASE_CLOSES), { period: 3 })).toEqual(EXPECTED);
  });

  it('alternates 底/頭/底 so the points connect into a zigzag', () => {
    const kinds = HeadBottomIndicator.compute(bars(BASE_CLOSES), { period: 3 }).map((p) => p.kind);

    expect(kinds).toEqual(['bottom', 'head', 'bottom']);
  });

  it('does not emit a pivot for the segment after the last cross, even as new bars arrive', () => {
    // idx10/11 收盤續強、沒有再穿越均線，最後一段仍未確認。
    const extended = bars([...BASE_CLOSES, 13, 14]);

    expect(HeadBottomIndicator.compute(extended, { period: 3 })).toEqual(EXPECTED);
  });

  it('confirms the pending segment only once the next cross happens', () => {
    // 接在 idx9 向上突破之後：idx10 收 13（仍在均線上），idx11 收 5 跌破 → 確認 [9,10] 區間的頭。
    const extended = bars([...BASE_CLOSES, 13, 5]);

    const points = HeadBottomIndicator.compute(extended, { period: 3 });

    expect(points).toHaveLength(EXPECTED.length + 1);
    // [9, 10] 的最高價：high(idx9)=13、high(idx10)=14 → idx10。
    expect(points.at(-1)).toEqual({ time: isoDay(10), price: 14, kind: 'head' });
  });

  it('keeps the earlier bar when two bars in a segment share the same extreme', () => {
    // 區間 [3,5] 內 idx4 與 idx5 同為最高收盤 15 → 高點同為 16，取較早的 idx4。
    const points = HeadBottomIndicator.compute(bars([10, 10, 10, 13, 15, 15, 9, 8, 7, 12]), { period: 3 });

    expect(points[1]).toEqual({ time: isoDay(4), price: 16, kind: 'head' });
  });

  it('returns no points when the close never crosses the moving average', () => {
    // 單調上升 → 收盤價恆在均線之上，沒有任何穿越。
    expect(HeadBottomIndicator.compute(bars([10, 11, 12, 13, 14, 15]), { period: 3 })).toEqual([]);
  });

  it('returns no points when there are fewer bars than the period', () => {
    expect(HeadBottomIndicator.compute(bars([10, 11]), { period: 5 })).toEqual([]);
  });

  it('treats close equal to the moving average as "not above" so a flat stretch does not oscillate', () => {
    // 全部同價 → ma 恆等於 close，above 恆為 false，不應產生任何突破。
    expect(HeadBottomIndicator.compute(bars([10, 10, 10, 10, 10, 10]), { period: 3 })).toEqual([]);
  });

  it('defaults to a 5-day moving average when period is not provided', () => {
    const withDefault = HeadBottomIndicator.compute(bars(BASE_CLOSES), {});
    const withExplicit = HeadBottomIndicator.compute(bars(BASE_CLOSES), { period: 5 });

    expect(withDefault).toEqual(withExplicit);
  });

  it('produces different pivots for different moving-average periods', () => {
    const data = bars(BASE_CLOSES);

    expect(HeadBottomIndicator.compute(data, { period: 3 })).not.toEqual(
      HeadBottomIndicator.compute(data, { period: 5 }),
    );
  });
});

describe('toHeadBottomMarkers', () => {
  it('labels 頭 above the bar pointing down and 底 below the bar pointing up', () => {
    expect(toHeadBottomMarkers(EXPECTED, '#ab47bc')).toEqual([
      { time: isoDay(2), position: 'belowBar', shape: 'arrowUp', color: '#ab47bc', text: '底' },
      { time: isoDay(5), position: 'aboveBar', shape: 'arrowDown', color: '#ab47bc', text: '頭' },
      { time: isoDay(8), position: 'belowBar', shape: 'arrowUp', color: '#ab47bc', text: '底' },
    ]);
  });
});

describe('HeadBottomIndicator.mount', () => {
  it('feeds only the pivot points to a single line series on the price pane', () => {
    const fake = createFakeChart();

    HeadBottomIndicator.mount(fake.chart, fake.allocator, bars(BASE_CLOSES), { period: 3 });

    expect(fake.series).toHaveLength(1);
    expect(fake.series[0].paneIndex).toBe(0);
    expect(fake.series[0].lastData).toEqual([
      { time: isoDay(2), value: 9 },
      { time: isoDay(5), value: 16 },
      { time: isoDay(8), value: 6 },
    ]);
  });

  it('does not consume a separate pane', () => {
    const fake = createFakeChart();

    HeadBottomIndicator.mount(fake.chart, fake.allocator, bars(BASE_CLOSES), { period: 3 });

    expect(fake.allocateCount()).toBe(0);
  });

  it('applies the color param on mount and on update', () => {
    const fake = createFakeChart();
    const data = bars(BASE_CLOSES);

    const handle = HeadBottomIndicator.mount(fake.chart, fake.allocator, data, {
      period: 3,
      color: '#111111',
    });
    expect(fake.series[0].addOptions.color).toBe('#111111');

    handle.update(data, { period: 3, color: '#222222' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#222222');
  });

  it('attaches the markers plugin on mount and detaches it plus the series on dispose', () => {
    const fake = createFakeChart();

    const handle = HeadBottomIndicator.mount(fake.chart, fake.allocator, bars(BASE_CLOSES), { period: 3 });
    expect(fake.series[0].primitives).toHaveLength(1);

    handle.dispose();
    expect(fake.series[0].primitives).toHaveLength(0);
    expect(fake.series[0].removed).toBe(true);
  });
});
