import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { trueRange } from './atr';
import { DmiIndicator } from './dmi';
import { wilderRma } from './movingAverage';
import { getIndicator } from './registry';
import { createFakeChart, isoDay } from './testFakeChart';

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

/** 穩定上升的假資料：每根高低同步墊高，+DM 恆為正、−DM 恆為 0。 */
function risingBars(length: number): OhlcvBar[] {
  return ohlcBars(Array.from({ length }, (_, i) => [12 + i, 10 + i, 11 + i]));
}

/** 高低隨機起伏的假資料（固定序列，非亂數），用來與獨立實作交叉驗證。 */
function choppyBars(): OhlcvBar[] {
  const offsets = [0, 2, -1, 3, 1, 4, -2, 5, 2, 6, 3, 1, 4, 7, 5, 8, 6, 9, 7, 10];
  return ohlcBars(offsets.map((offset) => [22 + offset, 18 + offset, 20 + offset]));
}

describe('DmiIndicator', () => {
  it('registers itself into the indicator registry as "dmi"', () => {
    expect(getIndicator('dmi')).toBe(DmiIndicator);
  });

  it('is a separate-pane indicator', () => {
    expect(DmiIndicator.placement).toBe('separate-pane');
  });

  it('puts all directional movement on +DI and drives ADX to 100 in a clean uptrend', () => {
    // 每根高低同步 +1 → +DM 恆為 1、−DM 恆為 0、TR 恆為 2（高低差）。
    // 故 +DI = 100×1/2 = 50、−DI = 0，DX = 100×|50−0|/50 = 100，ADX 平滑後仍是 100。
    const points = DmiIndicator.compute(risingBars(20), { period: 3, adxPeriod: 3 });

    expect(points.length).toBeGreaterThan(0);
    expect(points.at(-1)!.plusDi).toBeCloseTo(50, 6);
    expect(points.at(-1)!.minusDi).toBeCloseTo(0, 6);
    expect(points.at(-1)!.adx).toBeCloseTo(100, 6);
  });

  it('mirrors that behaviour onto −DI in a clean downtrend', () => {
    const falling = ohlcBars(Array.from({ length: 20 }, (_, i) => [40 - i, 38 - i, 39 - i]));

    const last = DmiIndicator.compute(falling, { period: 3, adxPeriod: 3 }).at(-1)!;

    expect(last.minusDi).toBeCloseTo(50, 6);
    expect(last.plusDi).toBeCloseTo(0, 6);
    expect(last.adx).toBeCloseTo(100, 6);
  });

  it('leaves adx null until adxPeriod - 1 further bars have passed', () => {
    const points = DmiIndicator.compute(choppyBars(), { period: 3, adxPeriod: 4 });

    expect(points.slice(0, 3).every((point) => point.adx === null)).toBe(true);
    expect(points[3].adx).not.toBeNull();
    // 第一個 ±DI 落在 bars[period]。
    expect(points[0].time).toBe(isoDay(3));
  });

  it('cross-checks +DI/−DI/ADX against an independently written implementation', () => {
    const data = choppyBars();
    const period = 4;
    const adxPeriod = 3;

    const plusDm: number[] = [];
    const minusDm: number[] = [];
    for (let i = 1; i < data.length; i += 1) {
      const up = data[i].high - data[i - 1].high;
      const down = data[i - 1].low - data[i].low;
      plusDm.push(up > down && up > 0 ? up : 0);
      minusDm.push(down > up && down > 0 ? down : 0);
    }
    const tr = trueRange(data).slice(1);
    const sPlus = wilderRma(plusDm, period);
    const sMinus = wilderRma(minusDm, period);
    const sTr = wilderRma(tr, period);
    const plusDi = sPlus.map((value, i) => (100 * value) / sTr[i]);
    const minusDi = sMinus.map((value, i) => (100 * value) / sTr[i]);
    const dx = plusDi.map((plus, i) => (100 * Math.abs(plus - minusDi[i])) / (plus + minusDi[i]));
    const adx = wilderRma(dx, adxPeriod);

    const points = DmiIndicator.compute(data, { period, adxPeriod });

    expect(points).toHaveLength(plusDi.length);
    points.forEach((point, i) => {
      expect(point.plusDi).toBeCloseTo(plusDi[i], 10);
      expect(point.minusDi).toBeCloseTo(minusDi[i], 10);
      const expectedAdx = adx[i - (adxPeriod - 1)];
      if (expectedAdx === undefined) expect(point.adx).toBeNull();
      else expect(point.adx).toBeCloseTo(expectedAdx, 10);
    });
  });

  it('produces no points when there are fewer bars than the period allows', () => {
    expect(DmiIndicator.compute(risingBars(3), { period: 14 })).toEqual([]);
  });

  it('mounts three lines on one pane with the ADX 25 reference line and cleans up on dispose', () => {
    const fake = createFakeChart();
    const data = choppyBars();

    const handle = DmiIndicator.mount(fake.chart, fake.allocator, data, {
      period: 3,
      adxPeriod: 3,
      plusColor: '#111111',
      minusColor: '#222222',
      adxColor: '#333333',
    });

    expect(fake.series).toHaveLength(3);
    expect(fake.series.map((s) => s.paneIndex)).toEqual([2, 2, 2]);
    expect(fake.series.map((s) => s.addOptions.color)).toEqual(['#111111', '#222222', '#333333']);
    expect(fake.series[0].priceLines.map((line) => line.price)).toEqual([25]);

    // ADX 線的資料點比 ±DI 少（未成形的時間點不輸出）。
    const plusData = fake.series[0].lastData as unknown[];
    const adxData = fake.series[2].lastData as unknown[];
    expect(adxData.length).toBe(plusData.length - 2);

    handle.dispose();
    expect(fake.series.every((s) => s.removed)).toBe(true);
    expect(fake.releasedPanes).toEqual([2]);
  });
});
