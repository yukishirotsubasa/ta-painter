import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { getIndicator } from './registry';
import { MacdIndicator } from './macd';

function bar(time: string, close: number): OhlcvBar {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

function bars(closes: number[]): OhlcvBar[] {
  return closes.map((close, i) => bar(`2024-01-${String(i + 1).padStart(2, '0')}`, close));
}

describe('MacdIndicator', () => {
  it('registers itself into the indicator registry as "macd"', () => {
    expect(getIndicator('macd')).toBe(MacdIndicator);
  });

  it('is a separate-pane indicator', () => {
    expect(MacdIndicator.placement).toBe('separate-pane');
  });

  it('computes DIF/DEA/histogram matching hand-calculated EMA values on a linear price series', () => {
    // closes 為等差數列（+2），fastPeriod=2/slowPeriod=4/signalPeriod=2 手算：
    // EMA2 種子(idx1)=avg(10,12)=11，之後每步 value*(2/3)+prev*(1/3) 因數列線性而剛好等於 11,13,15,17,19,21,23。
    // EMA4 種子(idx3)=avg(10,12,14,16)=13，之後每步 value*0.4+prev*0.6 得 13,15,17,19,21。
    // DIF = fastEma-slowEma 在對齊索引上恆為 2；DEA = EMA2(DIF) 種子=avg(2,2)=2，之後恆為 2；histogram 恆為 0。
    const data = bars([10, 12, 14, 16, 18, 20, 22, 24]);

    const points = MacdIndicator.compute(data, { fastPeriod: 2, slowPeriod: 4, signalPeriod: 2 });

    expect(points).toEqual([
      { time: '2024-01-05', dif: 2, dea: 2, histogram: 0 },
      { time: '2024-01-06', dif: 2, dea: 2, histogram: 0 },
      { time: '2024-01-07', dif: 2, dea: 2, histogram: 0 },
      { time: '2024-01-08', dif: 2, dea: 2, histogram: 0 },
    ]);
  });

  it('cross-checks against an independently written EMA/MACD calculation on a non-trivial series', () => {
    const closes = [
      100, 102, 101, 105, 107, 106, 110, 112, 111, 115, 118, 116, 120, 122, 121, 125, 128, 126, 130, 133,
    ];
    const data = bars(closes);
    const fastPeriod = 3;
    const slowPeriod = 6;
    const signalPeriod = 3;

    function ema(values: number[], period: number): number[] {
      const k = 2 / (period + 1);
      const out: number[] = [];
      let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out.push(prev);
      for (let i = period; i < values.length; i += 1) {
        prev = values[i] * k + prev * (1 - k);
        out.push(prev);
      }
      return out;
    }

    const fastEma = ema(closes, fastPeriod);
    const slowEma = ema(closes, slowPeriod);
    const offset = slowPeriod - fastPeriod;
    const difValues = slowEma.map((slowValue, i) => fastEma[i + offset] - slowValue);
    const deaValues = ema(difValues, signalPeriod);

    const expectedPoints = deaValues.map((dea, i) => {
      const difIndex = i + signalPeriod - 1;
      const dif = difValues[difIndex];
      const barIndex = slowPeriod - 1 + difIndex;
      return { time: data[barIndex].time, dif, dea, histogram: dif - dea };
    });

    const points = MacdIndicator.compute(data, { fastPeriod, slowPeriod, signalPeriod });

    expect(points).toHaveLength(expectedPoints.length);
    points.forEach((point, i) => {
      expect(point.time).toBe(expectedPoints[i].time);
      expect(point.dif).toBeCloseTo(expectedPoints[i].dif, 10);
      expect(point.dea).toBeCloseTo(expectedPoints[i].dea, 10);
      expect(point.histogram).toBeCloseTo(expectedPoints[i].histogram, 10);
    });
  });

  it('produces exactly one point once there are just enough bars (slowPeriod + signalPeriod - 1)', () => {
    const fastPeriod = 3;
    const slowPeriod = 6;
    const signalPeriod = 3;
    const minLength = slowPeriod + signalPeriod - 1;
    const data = bars(Array.from({ length: minLength }, (_, i) => 100 + i));

    const points = MacdIndicator.compute(data, { fastPeriod, slowPeriod, signalPeriod });

    expect(points).toHaveLength(1);
  });

  it('produces no points when there are fewer bars than required', () => {
    const fastPeriod = 3;
    const slowPeriod = 6;
    const signalPeriod = 3;
    const minLength = slowPeriod + signalPeriod - 1;
    const data = bars(Array.from({ length: minLength - 1 }, (_, i) => 100 + i));

    expect(MacdIndicator.compute(data, { fastPeriod, slowPeriod, signalPeriod })).toEqual([]);
  });

  it('defaults to 12/26/9 periods when params are not provided', () => {
    const data = bars(Array.from({ length: 34 }, (_, i) => 100 + i));

    expect(MacdIndicator.compute(data, {})).toHaveLength(1);
  });
});
