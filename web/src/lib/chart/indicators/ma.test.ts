import { describe, expect, it } from 'vitest';
import type { OhlcvBar } from '../../data/types';
import { getIndicator } from './registry';
import { MaIndicator } from './ma';

function bar(time: string, close: number): OhlcvBar {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

describe('MaIndicator', () => {
  it('registers itself into the indicator registry as "ma"', () => {
    expect(getIndicator('ma')).toBe(MaIndicator);
  });

  it('computes a simple moving average matching hand-calculated values, skipping days with insufficient history', () => {
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12), bar('2024-01-03', 14), bar('2024-01-04', 16)];

    const points = MaIndicator.compute(bars, { period: 3 });

    // MA3 needs 3 days of history: day1/2 have none, day3 = (10+12+14)/3, day4 = (12+14+16)/3.
    expect(points).toEqual([
      { time: '2024-01-03', value: 12 },
      { time: '2024-01-04', value: 14 },
    ]);
  });

  it('matches MA5 hand-calculated from real published TWSE close prices (2330, 2024-09)', () => {
    // 收盤價取自 twseProvider.test.ts 的 REAL_STOCK_DAY_RESPONSE（113/09/02 ~ 113/09/06）。
    const bars = [
      bar('2024-09-02', 948),
      bar('2024-09-03', 940),
      bar('2024-09-04', 889),
      bar('2024-09-05', 902),
      bar('2024-09-06', 918),
    ];

    const points = MaIndicator.compute(bars, { period: 5 });

    const expectedMa5 = (948 + 940 + 889 + 902 + 918) / 5;
    expect(points).toEqual([{ time: '2024-09-06', value: expectedMa5 }]);
  });

  it('produces no points when there are fewer bars than the period', () => {
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12)];

    expect(MaIndicator.compute(bars, { period: 5 })).toEqual([]);
  });

  it('computes independently for different periods (MA5 vs MA20 do not interfere)', () => {
    const bars = Array.from({ length: 25 }, (_, i) => bar(`2024-01-${String(i + 1).padStart(2, '0')}`, i + 1));

    const ma5 = MaIndicator.compute(bars, { period: 5 });
    const ma20 = MaIndicator.compute(bars, { period: 20 });

    expect(ma5).toHaveLength(21);
    expect(ma20).toHaveLength(6);
    expect(ma5[0]).toEqual({ time: '2024-01-05', value: 3 });
    expect(ma20[0]).toEqual({ time: '2024-01-20', value: 10.5 });
  });

  it('defaults to a 20-day period when params.period is not provided', () => {
    const bars = Array.from({ length: 20 }, (_, i) => bar(`2024-01-${String(i + 1).padStart(2, '0')}`, 100));

    expect(MaIndicator.compute(bars, {})).toHaveLength(1);
  });

  it('computes on the field named by params.source (volume) instead of close', () => {
    const bars: OhlcvBar[] = [
      { time: '2024-01-01', open: 1, high: 1, low: 1, close: 1, volume: 100 },
      { time: '2024-01-02', open: 2, high: 2, low: 2, close: 2, volume: 200 },
      { time: '2024-01-03', open: 3, high: 3, low: 3, close: 3, volume: 300 },
    ];

    expect(MaIndicator.compute(bars, { period: 3, source: 'volume' })).toEqual([
      { time: '2024-01-03', value: 200 },
    ]);
  });

  it('matches the close result when source is close (default equivalence)', () => {
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12), bar('2024-01-03', 14)];

    const withSource = MaIndicator.compute(bars, { period: 3, source: 'close' });
    const withoutSource = MaIndicator.compute(bars, { period: 3 });

    expect(withSource).toEqual(withoutSource);
  });

  it('falls back to close when params.source is an unknown value', () => {
    const bars: OhlcvBar[] = [
      { time: '2024-01-01', open: 9, high: 9, low: 9, close: 1, volume: 100 },
      { time: '2024-01-02', open: 9, high: 9, low: 9, close: 3, volume: 200 },
    ];

    expect(MaIndicator.compute(bars, { period: 2, source: 'bogus' })).toEqual([
      { time: '2024-01-02', value: 2 },
    ]);
  });

  it('exposes source enum and color params in its schema', () => {
    const keys = MaIndicator.paramsSchema.map((s) => s.key);
    expect(keys).toEqual(['period', 'source', 'color']);

    const source = MaIndicator.paramsSchema.find((s) => s.key === 'source');
    expect(source?.type).toBe('enum');
    expect(source && 'options' in source && source.options.map((o) => o.value)).toEqual([
      'close',
      'open',
      'high',
      'low',
      'volume',
    ]);

    const color = MaIndicator.paramsSchema.find((s) => s.key === 'color');
    expect(color?.type).toBe('color');
  });

  interface FakeChart {
    chart: unknown;
    allocator: { allocate: () => number; release: () => void };
    addOptions: () => Record<string, unknown> | undefined;
    addPane: () => number | undefined;
    applied: Array<Record<string, unknown>>;
    currentPane: () => number;
  }

  function fakeChart(): FakeChart {
    let paneIndex = 0;
    let addOptions: Record<string, unknown> | undefined;
    let addPane: number | undefined;
    const applied: Array<Record<string, unknown>> = [];
    const line = {
      setData: () => {},
      applyOptions: (opts: Record<string, unknown>) => applied.push(opts),
      getPane: () => ({ paneIndex: () => paneIndex }),
      moveToPane: (target: number) => {
        paneIndex = target;
      },
    };
    const chart = {
      addSeries: (_series: unknown, options: Record<string, unknown>, pane: number) => {
        addOptions = options;
        addPane = pane;
        paneIndex = pane;
        return line;
      },
      removeSeries: () => {},
    };
    return {
      chart,
      allocator: { allocate: () => 2, release: () => {} },
      addOptions: () => addOptions,
      addPane: () => addPane,
      applied,
      currentPane: () => paneIndex,
    };
  }

  it('applies params.color to the line series on mount and on update', () => {
    const fake = fakeChart();
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12)];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = MaIndicator.mount(fake.chart as any, fake.allocator, bars, { period: 2, color: '#ff0000' });
    expect(fake.addOptions()?.color).toBe('#ff0000');

    handle.update(bars, { period: 2, color: '#00ff00' });
    expect(fake.applied.at(-1)?.color).toBe('#00ff00');
  });

  it('mounts a price-source MA on the main pane (0) with price format', () => {
    const fake = fakeChart();
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12)];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MaIndicator.mount(fake.chart as any, fake.allocator, bars, { period: 2, source: 'close' });

    expect(fake.addPane()).toBe(0);
    expect(fake.addOptions()?.priceFormat).toEqual({ type: 'price' });
  });

  it('mounts a volume-source MA on the volume pane (1) with volume format', () => {
    const fake = fakeChart();
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12)];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MaIndicator.mount(fake.chart as any, fake.allocator, bars, { period: 2, source: 'volume' });

    expect(fake.addPane()).toBe(1);
    expect(fake.addOptions()?.priceFormat).toEqual({ type: 'volume' });
  });

  it('moves the series between panes when source switches between price and volume', () => {
    const fake = fakeChart();
    const bars = [bar('2024-01-01', 10), bar('2024-01-02', 12)];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = MaIndicator.mount(fake.chart as any, fake.allocator, bars, { period: 2, source: 'close' });
    expect(fake.currentPane()).toBe(0);

    handle.update(bars, { period: 2, source: 'volume' });
    expect(fake.currentPane()).toBe(1);
    expect(fake.applied.at(-1)?.priceFormat).toEqual({ type: 'volume' });

    handle.update(bars, { period: 2, source: 'close' });
    expect(fake.currentPane()).toBe(0);
  });
});
