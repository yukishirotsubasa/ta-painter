import { describe, expect, it } from 'vitest';
import { addMonths, mergeOlderBars, previousDay } from './history';
import type { OhlcvBar } from './types';

function bar(time: string, close = 1): OhlcvBar {
  return { time, open: 1, high: 1, low: 1, close, volume: 1 };
}

describe('addMonths', () => {
  it('往前位移數個月', () => {
    expect(addMonths('2026-07-24', -3)).toBe('2026-04-24');
    expect(addMonths('2026-07-24', -12)).toBe('2025-07-24');
  });

  it('跨年往前', () => {
    expect(addMonths('2026-02-10', -3)).toBe('2025-11-10');
  });

  it('目標月沒有該日時夾到該月最後一天（不因溢位往後跳）', () => {
    // 3/31 往前一個月：2 月只有 28 天（2026 非閏年）→ 2/28，而非 JS Date 溢位的 3/3。
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    // 閏年 2 月有 29 天。
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    // 31 日往前到只有 30 天的月份。
    expect(addMonths('2026-07-31', -1)).toBe('2026-06-30');
  });

  it('往後位移也適用（正數）', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('previousDay', () => {
  it('一般情況退一天', () => {
    expect(previousDay('2026-07-24')).toBe('2026-07-23');
  });

  it('跨月', () => {
    expect(previousDay('2026-07-01')).toBe('2026-06-30');
  });

  it('跨年', () => {
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });

  it('閏日', () => {
    expect(previousDay('2024-03-01')).toBe('2024-02-29');
  });
});

describe('mergeOlderBars', () => {
  it('把更舊的資料接在前面並維持升冪', () => {
    const older = [bar('2026-01-02'), bar('2026-01-03')];
    const existing = [bar('2026-02-01'), bar('2026-02-02')];

    expect(mergeOlderBars(older, existing).map((b) => b.time)).toEqual([
      '2026-01-02',
      '2026-01-03',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('重疊的同一天只留一筆，且以既有資料為準', () => {
    const older = [bar('2026-01-30', 10), bar('2026-02-01', 20)];
    const existing = [bar('2026-02-01', 99), bar('2026-02-02', 30)];

    const merged = mergeOlderBars(older, existing);

    expect(merged.map((b) => b.time)).toEqual(['2026-01-30', '2026-02-01', '2026-02-02']);
    expect(merged.find((b) => b.time === '2026-02-01')?.close).toBe(99);
  });

  it('輸入未排序時仍輸出升冪', () => {
    const older = [bar('2026-01-05'), bar('2026-01-01'), bar('2026-01-03')];

    expect(mergeOlderBars(older, []).map((b) => b.time)).toEqual(['2026-01-01', '2026-01-03', '2026-01-05']);
  });

  it('older 為空時原樣回傳既有資料', () => {
    const existing = [bar('2026-02-01'), bar('2026-02-02')];
    expect(mergeOlderBars([], existing)).toEqual(existing);
  });

  it('兩邊皆空回傳空陣列', () => {
    expect(mergeOlderBars([], [])).toEqual([]);
  });
});
