import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStockList, resetStockListCache } from './stockList';

function stubFetch(response: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetStockListCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadStockList', () => {
  it('fetches and returns the list', async () => {
    const fetchMock = stubFetch([{ code: '2330', name: '台積電', market: 'TWSE' }]);

    await expect(loadStockList()).resolves.toEqual([{ code: '2330', name: '台積電', market: 'TWSE' }]);
    expect(fetchMock.mock.calls[0][0]).toContain('stock-list.json');
  });

  it('fetches only once across calls', async () => {
    const fetchMock = stubFetch([{ code: '2330', name: '台積電', market: 'TWSE' }]);

    const [first, second] = await Promise.all([loadStockList(), loadStockList()]);
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops malformed entries but keeps the rest', async () => {
    stubFetch([
      { code: '2330', name: '台積電', market: 'TWSE' },
      { code: '9999', name: '未知市場', market: 'EMERGING' },
      { code: 1234, name: '代號非字串', market: 'TWSE' },
      null,
      { code: '6488', name: '環球晶', market: 'TPEX' },
    ]);

    await expect(loadStockList()).resolves.toEqual([
      { code: '2330', name: '台積電', market: 'TWSE' },
      { code: '6488', name: '環球晶', market: 'TPEX' },
    ]);
  });

  it('rejects on a non-2xx response', async () => {
    stubFetch(null, false, 404);
    await expect(loadStockList()).rejects.toThrow('HTTP 404');
  });

  it('rejects when the payload is not an array', async () => {
    stubFetch({ code: '2330' });
    await expect(loadStockList()).rejects.toThrow('格式不正確');
  });

  it('does not cache a failure, so the next call retries', async () => {
    const failing = stubFetch(null, false, 500);
    await expect(loadStockList()).rejects.toThrow('HTTP 500');
    expect(failing).toHaveBeenCalledTimes(1);

    const succeeding = stubFetch([{ code: '2330', name: '台積電', market: 'TWSE' }]);
    await expect(loadStockList()).resolves.toHaveLength(1);
    expect(succeeding).toHaveBeenCalledTimes(1);
  });
});
