import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProvider } from './providerRegistry';
import { TpexProvider } from './tpexProvider';

// 取自實際呼叫（經 proxy）TPEx tradingStock code=6488 date=2024/09/01 的真實回應（節錄），
// 用來驗證解析結果與官方原始數字一致。成交仟股（如 '676'）代表 676,000 股。
const REAL_TRADING_STOCK_RESPONSE = {
  stat: 'ok',
  code: '6488',
  name: '環球晶',
  tables: [
    {
      title: '個股日成交資訊',
      subtitle: '6488 環球晶 113年09月',
      fields: ['日 期', '成交仟股', '成交仟元', '開盤', '最高', '最低', '收盤', '漲跌', '筆數'],
      data: [
        ['113/09/02', '676', '328,983', '487.50', '490.50', '484.00', '485.00', '0.50', '1,070'],
        ['113/09/03', '856', '412,914', '484.00', '485.50', '477.00', '485.50', '0.50', '1,336'],
        ['113/09/04', '2,754', '1,266,950', '471.50', '471.50', '453.50', '457.00', '-28.50', '5,536'],
        ['113/09/30', '1,141', '520,034', '458.00', '459.00', '453.50', '455.00', '-6.00', '1,713'],
      ],
    },
  ],
};

function stubFetchOnce(response: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => response,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TpexProvider', () => {
  it('registers itself into providerRegistry as "tpex"', () => {
    expect(getProvider('tpex')).toBe(TpexProvider);
  });

  it('parses ROC dates, converts 成交仟股 to shares, and filters to the requested range', async () => {
    stubFetchOnce(REAL_TRADING_STOCK_RESPONSE);

    const bars = await TpexProvider.fetchDaily('6488', { start: '2024-09-03', end: '2024-09-04' });

    expect(bars).toEqual([
      { time: '2024-09-03', open: 484, high: 485.5, low: 477, close: 485.5, volume: 856_000 },
      { time: '2024-09-04', open: 471.5, high: 471.5, low: 453.5, close: 457, volume: 2_754_000 },
    ]);
  });

  it('calls the tradingStock endpoint via the tpex proxy with month-anchored western date', async () => {
    stubFetchOnce(REAL_TRADING_STOCK_RESPONSE);

    await TpexProvider.fetchDaily('6488', { start: '2024-09-15', end: '2024-09-30' });

    const upstream = '/www/zh-tw/afterTrading/tradingStock?code=6488&date=2024/09/01&id=&response=json';
    expect(fetch).toHaveBeenCalledWith(
      `https://ta-painter.yukishirotsubasa.deno.net/proxy/tpex?path=${encodeURIComponent(upstream)}`,
      expect.anything(),
    );
  });

  it('reports progress once the single-month fetch completes', async () => {
    stubFetchOnce(REAL_TRADING_STOCK_RESPONSE);
    const onProgress = vi.fn();

    await TpexProvider.fetchDaily('6488', { start: '2024-09-01', end: '2024-09-30' }, onProgress);

    expect(onProgress).toHaveBeenCalledWith({ loaded: 1, total: 1 });
  });

  it('returns empty result (no throw) when TPEx reports stat=ok with empty data for an unknown code', async () => {
    stubFetchOnce({ stat: 'ok', tables: [{ data: [] }] });

    await expect(TpexProvider.fetchDaily('9999', { start: '2024-09-01', end: '2024-09-30' })).resolves.toEqual([]);
  });

  it('throws when TPEx reports a non-ok status', async () => {
    stubFetchOnce({ stat: 'error' });

    await expect(TpexProvider.fetchDaily('6488', { start: '2024-09-01', end: '2024-09-30' })).rejects.toThrow(
      'TPEx 查詢失敗',
    );
  });

  it('throws on non-2xx HTTP responses', async () => {
    stubFetchOnce({}, false, 500);

    await expect(TpexProvider.fetchDaily('6488', { start: '2024-09-01', end: '2024-09-30' })).rejects.toThrow(
      'HTTP 500',
    );
  });
});
