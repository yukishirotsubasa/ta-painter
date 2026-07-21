import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateRange, OhlcvBar, StockDataProvider } from './types';
import { fetchDailyRange } from './throttle';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

/** 相對「現在」往前推 monthsAgo 個月起算，涵蓋 span 個月的區間，確保不落在當月（快取當月一律視為過期）。 */
function pastMonthsRange(monthsAgo: number, span: number): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + span - 1, 1);
  const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`,
    end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(lastDay)}`,
  };
}

function createMockProvider() {
  const calls: DateRange[] = [];
  const provider: StockDataProvider = {
    id: 'mock',
    label: 'Mock Provider',
    async fetchDaily(_stockNo, range, _onProgress, signal): Promise<OhlcvBar[]> {
      calls.push(range);
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      return [{ time: range.start, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    },
  };
  return { provider, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchDailyRange', () => {
  it('queries every month in the range exactly once, in order, with no gaps or duplicates', async () => {
    const { provider, calls } = createMockProvider();

    const bars = await fetchDailyRange(provider, '2330', { start: '2024-01-01', end: '2024-06-30' });

    expect(bars.map((bar) => bar.time)).toEqual([
      '2024-01-01',
      '2024-02-01',
      '2024-03-01',
      '2024-04-01',
      '2024-05-01',
      '2024-06-01',
    ]);
    expect(new Set(calls.map((range) => range.start.slice(0, 7))).size).toBe(6);
  });

  it('always queries the provider for the full calendar month (so cached months stay reusable), then clips the returned bars to the overall query boundaries', async () => {
    const { provider, calls } = createMockProvider();

    const bars = await fetchDailyRange(provider, '2330', { start: '2024-01-15', end: '2024-02-10' });

    expect(calls).toEqual([
      { start: '2024-01-01', end: '2024-01-31' },
      { start: '2024-02-01', end: '2024-02-29' },
    ]);
    expect(bars.map((bar) => bar.time)).toEqual(['2024-02-01']);
  });

  it('reports progress after each month completes, ending with loaded === total', async () => {
    const { provider } = createMockProvider();
    const onProgress = vi.fn();

    await fetchDailyRange(provider, '2330', { start: '2024-01-01', end: '2024-03-31' }, onProgress);

    expect(onProgress).toHaveBeenNthCalledWith(1, { loaded: 1, total: 3, message: expect.any(String) });
    expect(onProgress).toHaveBeenNthCalledWith(2, { loaded: 2, total: 3, message: expect.any(String) });
    expect(onProgress).toHaveBeenNthCalledWith(3, { loaded: 3, total: 3, message: expect.any(String) });
  });

  it('throttles requests 300-500ms apart', async () => {
    vi.useFakeTimers();
    const { provider } = createMockProvider();
    const timestamps: number[] = [];
    const timedProvider: StockDataProvider = {
      ...provider,
      fetchDaily: (...args) => {
        timestamps.push(Date.now());
        return provider.fetchDaily(...args);
      },
    };

    const promise = fetchDailyRange(timedProvider, '2330', { start: '2024-01-01', end: '2024-03-31' });
    await vi.runAllTimersAsync();
    await promise;

    expect(timestamps).toHaveLength(3);
    for (let i = 1; i < timestamps.length; i += 1) {
      const gap = timestamps[i] - timestamps[i - 1];
      expect(gap).toBeGreaterThanOrEqual(300);
      expect(gap).toBeLessThanOrEqual(500);
    }
  });

  it('stops the queue and rejects with AbortError when cancelled mid-query, without further requests', async () => {
    vi.useFakeTimers();
    const { provider, calls } = createMockProvider();
    const controller = new AbortController();

    const promise = fetchDailyRange(
      provider,
      '2330',
      { start: '2024-01-01', end: '2024-06-30' },
      undefined,
      controller.signal,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(1);
  });

  it('rejects immediately without any request when the signal is already aborted', async () => {
    const { provider, calls } = createMockProvider();
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchDailyRange(provider, '2330', { start: '2024-01-01', end: '2024-06-30' }, undefined, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(0);
  });
});

describe('fetchDailyRange with localStorage cache (data4)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call the provider again for historical months already cached from a prior query of the same range', async () => {
    const { provider, calls } = createMockProvider();
    const range = pastMonthsRange(24, 3);

    const first = await fetchDailyRange(provider, '2330', range);
    expect(calls).toHaveLength(3);

    const second = await fetchDailyRange(provider, '2330', range);
    expect(calls).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it('keys the cache per provider and per stock number, so different providers/stocks still hit the network', async () => {
    const { provider: providerA, calls: callsA } = createMockProvider();
    const { provider: providerB, calls: callsB } = createMockProvider();
    const range = pastMonthsRange(30, 1);

    await fetchDailyRange(providerA, '2330', range);
    await fetchDailyRange({ ...providerB, id: 'other' }, '2330', range);
    await fetchDailyRange(providerA, '0050', range);

    expect(callsA).toHaveLength(2);
    expect(callsB).toHaveLength(1);
  });
});
