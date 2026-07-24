import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { ObvIndicator } from './obv';
import { getIndicator } from './registry';
import { createFakeChart, isoDay } from './testFakeChart';

function bars(rows: Array<[close: number, volume: number]>): OhlcvBar[] {
  return rows.map(([close, volume], i) => ({
    time: isoDay(i),
    open: close,
    high: close,
    low: close,
    close,
    volume,
  }));
}

describe('ObvIndicator', () => {
  it('registers itself into the indicator registry as "obv"', () => {
    expect(getIndicator('obv')).toBe(ObvIndicator);
  });

  it('is a separate-pane indicator', () => {
    expect(ObvIndicator.placement).toBe('separate-pane');
  });

  it('adds volume on up days, subtracts on down days and holds on flat days', () => {
    const points = ObvIndicator.compute(
      bars([
        [10, 100],
        [12, 200],
        [11, 300],
        [11, 400],
        [13, 500],
      ]),
      {},
    );

    expect(points).toEqual([
      { time: isoDay(0), value: 0 },
      { time: isoDay(1), value: 200 },
      { time: isoDay(2), value: -100 },
      { time: isoDay(3), value: -100 },
      { time: isoDay(4), value: 400 },
    ]);
  });

  it('emits a point for every bar (no warm-up period)', () => {
    const data = bars(Array.from({ length: 7 }, (_, i) => [10 + i, 100] as [number, number]));

    expect(ObvIndicator.compute(data, {})).toHaveLength(data.length);
  });

  it('returns an empty series for empty input', () => {
    expect(ObvIndicator.compute([], {})).toEqual([]);
  });

  it('has no period parameter, only a line color', () => {
    expect(ObvIndicator.paramsSchema.map((schema) => schema.key)).toEqual(['color']);
  });

  it('mounts on an allocated pane with volume number formatting and releases it on dispose', () => {
    const fake = createFakeChart();
    const data = bars([
      [10, 100],
      [12, 200],
    ]);

    const handle = ObvIndicator.mount(fake.chart, fake.allocator, data, { color: '#111111' });

    expect(fake.series[0].paneIndex).toBe(2);
    expect(fake.series[0].addOptions.priceFormat).toEqual({ type: 'volume' });
    expect(fake.series[0].addOptions.color).toBe('#111111');

    handle.update(data, { color: '#222222' });
    expect(fake.series[0].applied.at(-1)?.color).toBe('#222222');

    handle.dispose();
    expect(fake.series[0].removed).toBe(true);
    expect(fake.releasedPanes).toEqual([2]);
  });
});
