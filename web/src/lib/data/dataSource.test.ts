import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateRequestCount, fetchBars, resolveProvider } from './dataSource';
import { TpexProvider } from './providers/tpexProvider';
import { TwseProvider } from './providers/twseProvider';
import { YahooProvider } from './providers/yahooProvider';

const YAHOO_RESPONSE = {
  chart: {
    error: null,
    result: [
      {
        meta: { gmtoffset: 28800 },
        timestamp: [1725238800],
        indicators: { quote: [{ open: [950], high: [955], low: [943], close: [948], volume: [1] }] },
      },
    ],
  },
};

const TWSE_RESPONSE = {
  stat: 'OK',
  data: [['113/09/02', '1,000', '0', '950', '955', '943', '948', '+1', '1']],
};

const TPEX_RESPONSE = {
  stat: 'ok',
  tables: [{ data: [['113/09/02', '1,000', '0', '487.5', '490.5', '484', '485', '+1', '1']] }],
};

/** 記錄每次請求命中的來源，用來驗證資料源路由。 */
function stubFetch() {
  const hits: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('https://www.twse.com.tw/')) {
        hits.push('twse');
        return Promise.resolve({ ok: true, status: 200, json: async () => TWSE_RESPONSE });
      }
      const source = new URL(url).pathname.split('/').pop();
      hits.push(source!);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => (source === 'yahoo' ? YAHOO_RESPONSE : TPEX_RESPONSE),
      });
    }),
  );
  return hits;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('resolveProvider', () => {
  it('always uses Yahoo for the yahoo source, regardless of market', () => {
    expect(resolveProvider('yahoo', null)).toBe(YahooProvider);
    expect(resolveProvider('yahoo', 'TWSE')).toBe(YahooProvider);
    expect(resolveProvider('yahoo', 'TPEX')).toBe(YahooProvider);
  });

  it('routes the official source by market: TWSE for listed, TPEx for OTC', () => {
    expect(resolveProvider('official', 'TWSE')).toBe(TwseProvider);
    expect(resolveProvider('official', 'TPEX')).toBe(TpexProvider);
  });

  it('cannot resolve the official source without a market', () => {
    expect(resolveProvider('official', null)).toBeNull();
  });
});

describe('estimateRequestCount', () => {
  it('is always 1 for Yahoo (single request covers the whole range)', () => {
    expect(estimateRequestCount('yahoo', { start: '2024-01-01', end: '2024-12-31' })).toBe(1);
  });

  it('equals the month count for the official source', () => {
    expect(estimateRequestCount('official', { start: '2024-01-01', end: '2024-06-30' })).toBe(6);
  });
});

describe('fetchBars', () => {
  it('fetches the whole range in a single Yahoo request', async () => {
    const hits = stubFetch();

    const bars = await fetchBars('yahoo', '2330', 'TWSE', { start: '2024-01-01', end: '2024-09-30' });

    expect(hits).toEqual(['yahoo']);
    expect(bars).toEqual([{ time: '2024-09-02', open: 950, high: 955, low: 943, close: 948, volume: 1 }]);
  });

  it('fetches month by month from TWSE for a listed stock on the official source', async () => {
    vi.useFakeTimers();
    const hits = stubFetch();

    const promise = fetchBars('official', '2330', 'TWSE', { start: '2024-08-01', end: '2024-10-31' });
    await vi.runAllTimersAsync();
    await promise;

    expect(hits).toEqual(['twse', 'twse', 'twse']);
  });

  it('fetches from TPEx for an OTC stock on the official source', async () => {
    const hits = stubFetch();

    const bars = await fetchBars('official', '6488', 'TPEX', { start: '2024-09-01', end: '2024-09-30' });

    expect(hits).toEqual(['tpex']);
    expect(bars).toEqual([{ time: '2024-09-02', open: 487.5, high: 490.5, low: 484, close: 485, volume: 1000000 }]);
  });

  it('rejects with an actionable message when the official source has no market to route by', async () => {
    stubFetch();

    await expect(fetchBars('official', '9999', null, { start: '2024-09-01', end: '2024-09-30' })).rejects.toThrow(
      '無法判斷 9999 的市場別',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
