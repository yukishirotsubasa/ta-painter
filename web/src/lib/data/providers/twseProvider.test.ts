import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProvider } from './providerRegistry';
import { TwseProvider } from './twseProvider';

// 取自實際呼叫 https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20240901&stockNo=2330
// 的真實回應（節錄），用來驗證解析結果與官方原始數字一致。
const REAL_STOCK_DAY_RESPONSE = {
  stat: 'OK',
  date: '20240901',
  title: '113年09月 2330 台積電           各日成交資訊',
  fields: ['日期', '成交股數', '成交金額', '開盤價', '最高價', '最低價', '收盤價', '漲跌價差', '成交筆數', '註記'],
  data: [
    ['113/09/02', '19,272,593', '18,270,058,260', '950.00', '955.00', '943.00', '948.00', '+4.00', '31,642', ''],
    ['113/09/03', '23,205,623', '21,908,471,541', '948.00', '952.00', '939.00', '940.00', '-8.00', '47,139', ''],
    ['113/09/04', '93,169,835', '83,424,133,824', '894.00', '905.00', '888.00', '889.00', '-51.00', '393,210', ''],
    ['113/09/05', '34,147,890', '30,998,595,394', '907.00', '915.00', '900.00', '902.00', '+13.00', '63,902', ''],
    ['113/09/06', '28,248,063', '25,786,016,936', '909.00', '918.00', '903.00', '918.00', '+16.00', '38,415', ''],
    ['113/09/12', '43,749,260', '40,999,951,508', '936.00', '944.00', '928.00', '940.00', 'X0.00', '80,643', ''],
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

describe('TwseProvider', () => {
  it('registers itself into providerRegistry as "twse"', () => {
    expect(getProvider('twse')).toBe(TwseProvider);
  });

  it('parses ROC dates, comma-separated numbers, and filters to the requested range', async () => {
    stubFetchOnce(REAL_STOCK_DAY_RESPONSE);

    const bars = await TwseProvider.fetchDaily('2330', { start: '2024-09-03', end: '2024-09-05' });

    expect(bars).toEqual([
      { time: '2024-09-03', open: 948, high: 952, low: 939, close: 940, volume: 23205623 },
      { time: '2024-09-04', open: 894, high: 905, low: 888, close: 889, volume: 93169835 },
      { time: '2024-09-05', open: 907, high: 915, low: 900, close: 902, volume: 34147890 },
    ]);
  });

  it('parses rows whose 漲跌價差 uses the unusual X-prefix without affecting OHLCV parsing', async () => {
    stubFetchOnce(REAL_STOCK_DAY_RESPONSE);

    const bars = await TwseProvider.fetchDaily('2330', { start: '2024-09-12', end: '2024-09-12' });

    expect(bars).toEqual([{ time: '2024-09-12', open: 936, high: 944, low: 928, close: 940, volume: 43749260 }]);
  });

  it('calls the STOCK_DAY endpoint with the western-year date and stock number', async () => {
    stubFetchOnce(REAL_STOCK_DAY_RESPONSE);

    await TwseProvider.fetchDaily('2330', { start: '2024-09-01', end: '2024-09-30' });

    expect(fetch).toHaveBeenCalledWith(
      'https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20240901&stockNo=2330',
      expect.anything(),
    );
  });

  it('reports progress once the single-month fetch completes', async () => {
    stubFetchOnce(REAL_STOCK_DAY_RESPONSE);
    const onProgress = vi.fn();

    await TwseProvider.fetchDaily('2330', { start: '2024-09-01', end: '2024-09-30' }, onProgress);

    expect(onProgress).toHaveBeenCalledWith({ loaded: 1, total: 1 });
  });

  it('throws when TWSE reports a non-OK status (e.g. invalid stock number)', async () => {
    stubFetchOnce({ stat: '很抱歉，沒有符合條件的資料!', total: 0 });

    await expect(TwseProvider.fetchDaily('0000', { start: '2024-09-01', end: '2024-09-30' })).rejects.toThrow(
      '很抱歉，沒有符合條件的資料!',
    );
  });

  it('throws on non-2xx HTTP responses', async () => {
    stubFetchOnce({}, false, 500);

    await expect(TwseProvider.fetchDaily('2330', { start: '2024-09-01', end: '2024-09-30' })).rejects.toThrow(
      'HTTP 500',
    );
  });
});
