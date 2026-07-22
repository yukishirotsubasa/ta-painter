import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { UP_COLOR, DOWN_COLOR, DEFAULT_LINE_COLOR } from '../colors';
import { getIndicator } from './registry';
import { MacdIndicator } from './macd';

function bar(time: string, close: number): OhlcvBar {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

function bars(closes: number[]): OhlcvBar[] {
  return closes.map((close, i) => bar(`2024-01-${String(i + 1).padStart(2, '0')}`, close));
}

interface FakeSeries {
  addOptions: Record<string, unknown>;
  applied: Array<Record<string, unknown>>;
  lastData: unknown;
}

/** 依掛載順序記錄各 series：series[0]=DIF、series[1]=DEA、series[2]=histogram。 */
function fakeChart(): { chart: unknown; allocator: { allocate: () => number; release: () => void }; series: FakeSeries[] } {
  const series: FakeSeries[] = [];
  const chart = {
    addSeries: (_series: unknown, options: Record<string, unknown>) => {
      const record: FakeSeries = { addOptions: options, applied: [], lastData: undefined };
      series.push(record);
      return {
        setData: (data: unknown) => {
          record.lastData = data;
        },
        applyOptions: (opts: Record<string, unknown>) => record.applied.push(opts),
      };
    },
    removeSeries: () => {},
  };
  return { chart, allocator: { allocate: () => 2, release: () => {} }, series };
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

  it('exposes difColor and deaColor color params in its schema', () => {
    const dif = MacdIndicator.paramsSchema.find((s) => s.key === 'difColor');
    const dea = MacdIndicator.paramsSchema.find((s) => s.key === 'deaColor');

    expect(dif?.type).toBe('color');
    expect(dif && 'default' in dif && dif.default).toBe(DEFAULT_LINE_COLOR);
    expect(dea?.type).toBe('color');
    expect(dea && 'default' in dea && dea.default).toBe('#ff9800');
  });

  it('applies difColor/deaColor on mount and update; histogram bars use the shared up/down colors', () => {
    // 收盤價升跌交錯，確保 histogram 同時出現正負（漲跌兩色）。
    const data = bars([100, 102, 101, 105, 107, 106, 110, 112, 111, 115, 118, 116]);
    const params = { fastPeriod: 3, slowPeriod: 6, signalPeriod: 3 };
    const fake = fakeChart();

    const handle = MacdIndicator.mount(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fake.chart as any,
      fake.allocator,
      data,
      { ...params, difColor: '#111111', deaColor: '#222222' },
    );

    expect(fake.series[0].addOptions.color).toBe('#111111');
    expect(fake.series[1].addOptions.color).toBe('#222222');

    const histogram = fake.series[2].lastData as Array<{ color: string }>;
    expect(histogram.length).toBeGreaterThan(0);
    for (const point of histogram) {
      expect([UP_COLOR, DOWN_COLOR]).toContain(point.color);
    }

    handle.update(data, { ...params, difColor: '#333333', deaColor: '#444444' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#333333');
    expect(fake.series[1].applied.at(-1)?.color).toBe('#444444');
  });
});
