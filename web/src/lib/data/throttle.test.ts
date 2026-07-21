import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DateRange, OhlcvBar, StockDataProvider } from './types';
import { fetchDailyRange } from './throttle';

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

  it('clips the first and last month range to the overall query boundaries', async () => {
    const { provider, calls } = createMockProvider();

    await fetchDailyRange(provider, '2330', { start: '2024-01-15', end: '2024-02-10' });

    expect(calls).toEqual([
      { start: '2024-01-15', end: '2024-01-31' },
      { start: '2024-02-01', end: '2024-02-10' },
    ]);
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
