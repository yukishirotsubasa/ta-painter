import { describe, expect, it } from 'vitest';
import { detectAdjustmentDates, toAdjustedBars } from './adjustment';
import type { OhlcvBar } from './types';

/** 精簡建構子：只給關鍵欄位，其餘補預設。 */
function bar(time: string, close: number, adjClose?: number, overrides: Partial<OhlcvBar> = {}): OhlcvBar {
  return { time, open: close, high: close, low: close, close, volume: 1000, adjClose, ...overrides };
}

describe('toAdjustedBars', () => {
  it('scales OHL by adjClose/close and sets close to adjClose', () => {
    const input = [bar('2024-01-02', 100, 90, { open: 100, high: 110, low: 95, volume: 500 })];

    expect(toAdjustedBars(input)).toEqual([
      // factor 0.9：open 90、high 99、low 85.5、close 90；volume/time 不變。
      { time: '2024-01-02', open: 90, high: 99, low: 85.5, close: 90, volume: 500, adjClose: 90 },
    ]);
  });

  it('leaves bars without adjClose untouched (same reference)', () => {
    const raw = bar('2024-01-02', 100);
    const [out] = toAdjustedBars([raw]);
    expect(out).toBe(raw);
  });

  it('leaves bars with close=0 untouched (no division)', () => {
    const raw = bar('2024-01-02', 0, 0);
    const [out] = toAdjustedBars([raw]);
    expect(out).toBe(raw);
  });

  it('adjusts only the bars that have a factor, mixed input', () => {
    const withAdj = bar('2024-01-02', 100, 90);
    const withoutAdj = bar('2024-01-03', 110);
    const [a, b] = toAdjustedBars([withAdj, withoutAdj]);
    expect(a.close).toBe(90);
    expect(b).toBe(withoutAdj);
  });
});

describe('detectAdjustmentDates', () => {
  it('returns the ex-date where the adjustment factor steps', () => {
    const bars = [
      bar('2024-01-02', 100, 90), // factor 0.9
      bar('2024-01-03', 110, 99), // factor 0.9（不變）
      bar('2024-01-04', 120, 120), // factor 1.0（跳階）→ 變動日
      bar('2024-01-05', 130, 130), // factor 1.0（不變）
    ];
    expect(detectAdjustmentDates(bars)).toEqual(['2024-01-04']);
  });

  it('skips bars without adjClose without treating them as a change', () => {
    const bars = [
      bar('2024-01-02', 100, 90), // factor 0.9
      bar('2024-01-03', 105), // 無 adjClose → 略過、不更新基準
      bar('2024-01-04', 120, 120), // factor 1.0（相對 0.9 跳階）→ 變動日
    ];
    expect(detectAdjustmentDates(bars)).toEqual(['2024-01-04']);
  });

  it('ignores sub-threshold float noise', () => {
    const bars = [
      bar('2024-01-02', 100, 90),
      bar('2024-01-03', 100, 90.000001), // 相對變化 < 1e-4 → 非變動日
    ];
    expect(detectAdjustmentDates(bars)).toEqual([]);
  });

  it('returns empty when nothing has a factor', () => {
    expect(detectAdjustmentDates([bar('2024-01-02', 100), bar('2024-01-03', 110)])).toEqual([]);
  });
});
