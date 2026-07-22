import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProvider } from './providerRegistry';
import { YahooProvider } from './yahooProvider';

// 取自實際呼叫（經 proxy）Yahoo chart 2330.TW 的真實回應（節錄）。timestamp 為當日開盤（09:00 Asia/Taipei）
// 的 Unix 秒數，gmtoffset=28800；1725238800+28800 => 2024-09-02。
const REAL_TW_RESPONSE = {
  chart: {
    error: null,
    result: [
      {
        meta: { symbol: '2330.TW', gmtoffset: 28800 },
        timestamp: [1725238800, 1725325200, 1725411600],
        indicators: {
          quote: [
            {
              open: [950, 948, 894],
              high: [955, 952, 905],
              low: [943, 939, 888],
              close: [948, 940, 889],
              volume: [18646835, 19547575, 79709021],
            },
          ],
        },
      },
    ],
  },
};

// 錯的後綴（上市股查 .TWO）Yahoo 回 404 + chart.error、result 為 null。
const NOT_FOUND_RESPONSE = {
  chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } },
};

function jsonResponse(response: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => response };
}

/** 依 url 內的 symbol 後綴回不同回應，模擬 .TW / .TWO fallback。 */
function stubFetchBySuffix(map: { tw?: unknown; two?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const upstream = decodeURIComponent(new URL(url).searchParams.get('path') ?? '');
      if (upstream.includes('.TWO?')) {
        return Promise.resolve(jsonResponse(map.two ?? NOT_FOUND_RESPONSE, !!map.two, map.two ? 200 : 404));
      }
      return Promise.resolve(jsonResponse(map.tw ?? NOT_FOUND_RESPONSE, !!map.tw, map.tw ? 200 : 404));
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('YahooProvider', () => {
  it('registers itself into providerRegistry as "yahoo"', () => {
    expect(getProvider('yahoo')).toBe(YahooProvider);
  });

  it('parses timestamps to local dates, aligns OHLCV, and filters to range', async () => {
    stubFetchBySuffix({ tw: REAL_TW_RESPONSE });

    const bars = await YahooProvider.fetchDaily('2330', { start: '2024-09-02', end: '2024-09-03' });

    expect(bars).toEqual([
      { time: '2024-09-02', open: 950, high: 955, low: 943, close: 948, volume: 18646835 },
      { time: '2024-09-03', open: 948, high: 952, low: 939, close: 940, volume: 19547575 },
    ]);
  });

  it('uses .TW first for a listed stock (single request, no fallback)', async () => {
    stubFetchBySuffix({ tw: REAL_TW_RESPONSE });

    await YahooProvider.fetchDaily('2330', { start: '2024-09-01', end: '2024-09-30' });

    expect(fetch).toHaveBeenCalledTimes(1);
    const calledUrl = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    const upstream = decodeURIComponent(new URL(calledUrl).searchParams.get('path')!);
    expect(upstream).toContain('/v8/finance/chart/2330.TW?');
    expect(upstream).toContain(`period1=${Date.parse('2024-09-01T00:00:00Z') / 1000}`);
    // period2 = end + 1 天（排他上界）
    expect(upstream).toContain(`period2=${Date.parse('2024-09-30T00:00:00Z') / 1000 + 86400}`);
  });

  it('falls back to .TWO for an OTC stock when .TW returns not-found', async () => {
    const twoResponse = {
      chart: {
        error: null,
        result: [
          {
            meta: { symbol: '6488.TWO', gmtoffset: 28800 },
            timestamp: [1725238800],
            indicators: { quote: [{ open: [487.5], high: [490.5], low: [484], close: [485], volume: [676000] }] },
          },
        ],
      },
    };
    stubFetchBySuffix({ two: twoResponse });

    const bars = await YahooProvider.fetchDaily('6488', { start: '2024-09-01', end: '2024-09-30' });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bars).toEqual([{ time: '2024-09-02', open: 487.5, high: 490.5, low: 484, close: 485, volume: 676000 }]);
  });

  it('skips rows with null values (halted/missing days)', async () => {
    const withNulls = {
      chart: {
        error: null,
        result: [
          {
            meta: { gmtoffset: 28800 },
            timestamp: [1725238800, 1725325200],
            indicators: {
              quote: [{ open: [950, null], high: [955, null], low: [943, null], close: [948, null], volume: [1, null] }],
            },
          },
        ],
      },
    };
    stubFetchBySuffix({ tw: withNulls });

    const bars = await YahooProvider.fetchDaily('2330', { start: '2024-09-01', end: '2024-09-30' });

    expect(bars).toEqual([{ time: '2024-09-02', open: 950, high: 955, low: 943, close: 948, volume: 1 }]);
  });

  it('reports progress once after a successful fetch', async () => {
    stubFetchBySuffix({ tw: REAL_TW_RESPONSE });
    const onProgress = vi.fn();

    await YahooProvider.fetchDaily('2330', { start: '2024-09-01', end: '2024-09-30' }, onProgress);

    expect(onProgress).toHaveBeenCalledWith({ loaded: 1, total: 1 });
  });

  it('throws when all symbol suffixes fail', async () => {
    stubFetchBySuffix({});

    await expect(YahooProvider.fetchDaily('0000', { start: '2024-09-01', end: '2024-09-30' })).rejects.toThrow(
      'Yahoo 查詢失敗',
    );
  });
});
