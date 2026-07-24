import { describe, expect, it } from 'vitest';
import { ema, sma, wilderRma } from './movingAverage';

describe('sma', () => {
  it('averages each sliding window and starts at values[period - 1]', () => {
    expect(sma([10, 12, 14, 16], 3)).toEqual([12, 14]);
  });

  it('returns an empty array when there are fewer values than the period', () => {
    expect(sma([10, 12], 5)).toEqual([]);
  });

  it('returns one point when the value count exactly matches the period', () => {
    expect(sma([2, 4, 6], 3)).toEqual([4]);
  });
});

describe('ema', () => {
  it('seeds with the SMA of the first period values, then applies 2/(period+1) weighting', () => {
    // period=2 → k=2/3。種子 = avg(10,12) = 11；之後 14*2/3 + 11*1/3 = 13。
    expect(ema([10, 12, 14], 2)).toEqual([11, 13]);
  });

  it('matches an independently written EMA on a non-trivial series', () => {
    const values = [100, 102, 101, 105, 107, 106, 110, 112];
    const period = 3;
    const k = 2 / (period + 1);

    const expected: number[] = [];
    let previous = (values[0] + values[1] + values[2]) / period;
    expected.push(previous);
    for (let i = period; i < values.length; i += 1) {
      previous = values[i] * k + previous * (1 - k);
      expected.push(previous);
    }

    const actual = ema(values, period);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 10));
  });

  it('returns an empty array when there are fewer values than the period', () => {
    expect(ema([1, 2], 3)).toEqual([]);
  });
});

describe('wilderRma', () => {
  it('uses 1/period weighting rather than 2/(period+1)', () => {
    // period=2 → 種子 = avg(10,12) = 11；之後 11 + (14-11)/2 = 12.5（EMA 同輸入會是 13）。
    expect(wilderRma([10, 12, 14], 2)).toEqual([11, 12.5]);
    expect(ema([10, 12, 14], 2)).toEqual([11, 13]);
  });

  it('converges to a constant series without drift', () => {
    expect(wilderRma([5, 5, 5, 5, 5], 3)).toEqual([5, 5, 5]);
  });

  it('returns an empty array when there are fewer values than the period', () => {
    expect(wilderRma([1, 2], 3)).toEqual([]);
  });
});

describe('alignment contract shared by sma/ema/wilderRma', () => {
  it('always returns values.length - period + 1 points, aligned to values[period - 1]', () => {
    const values = Array.from({ length: 10 }, (_, i) => i + 1);

    for (const fn of [sma, ema, wilderRma]) {
      expect(fn(values, 4)).toHaveLength(values.length - 4 + 1);
    }
  });
});
