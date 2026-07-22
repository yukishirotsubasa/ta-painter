import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { numberParam, type IndicatorDefinition, type IndicatorParamValues } from './types';

/** Mock 指標：對 close 取最近 params.period 天的平均值，純粹依 bars/params 計算，無外部狀態。 */
const MockAverageIndicator: IndicatorDefinition<number[]> = {
  id: 'mock-average',
  label: 'Mock Average',
  placement: 'overlay',
  paramsSchema: [{ key: 'period', label: 'Period', default: 3 }],
  compute(bars: OhlcvBar[], params: IndicatorParamValues): number[] {
    const period = numberParam(params, 'period', 1);
    return bars.map((_, index) => {
      const window = bars.slice(Math.max(0, index - period + 1), index + 1);
      return window.reduce((sum, bar) => sum + bar.close, 0) / window.length;
    });
  },
  mount: () => ({ update: () => {}, dispose: () => {} }),
};

function makeBars(): OhlcvBar[] {
  return [
    { time: '2024-01-01', open: 10, high: 12, low: 9, close: 10, volume: 100 },
    { time: '2024-01-02', open: 10, high: 13, low: 10, close: 12, volume: 120 },
    { time: '2024-01-03', open: 12, high: 14, low: 11, close: 14, volume: 90 },
  ];
}

describe('IndicatorDefinition.compute purity', () => {
  it('returns the same output for the same input bars/params across repeated calls', () => {
    const params: IndicatorParamValues = { period: 2 };

    const first = MockAverageIndicator.compute(makeBars(), params);
    const second = MockAverageIndicator.compute(makeBars(), params);

    expect(first).toEqual(second);
    expect(first).toEqual([10, 11, 13]);
  });

  it('does not mutate the input bars array (no side effects)', () => {
    const bars = makeBars();
    const snapshot = JSON.parse(JSON.stringify(bars));

    MockAverageIndicator.compute(bars, { period: 3 });

    expect(bars).toEqual(snapshot);
  });

  it('does not depend on hidden external state between calls with different params', () => {
    const bars = makeBars();

    const withPeriod1 = MockAverageIndicator.compute(bars, { period: 1 });
    const withPeriod3 = MockAverageIndicator.compute(bars, { period: 3 });
    const withPeriod1Again = MockAverageIndicator.compute(bars, { period: 1 });

    expect(withPeriod1).toEqual(withPeriod1Again);
    expect(withPeriod1).not.toEqual(withPeriod3);
  });
});
