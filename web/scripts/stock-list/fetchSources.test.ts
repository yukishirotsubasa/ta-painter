import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTpexListedStocks, fetchTwseListedStocks } from './fetchSources.ts';

/** 最小可解析的 ISIN 片段；刻意全 ASCII，Big5 解碼後與原字串相同。 */
const TWSE_HTML = '<tr><td colspan=7 ><B> ETF <B> </td></tr><tr><td>0050 ETF50</td></tr>';
const TPEX_CSV = '公司代號,公司簡稱\r\n"6488","環球晶"\r\n';

function okResponse(body: string, contentType: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => contentType },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

const twseOk = () => okResponse(TWSE_HTML, 'text/html;charset=MS950');
const tpexOk = () => okResponse(TPEX_CSV, 'text/csv');

/** 依序回應：陣列每一項對應一次 fetch 呼叫，Error 代表該次連線直接失敗。 */
function stubFetchSequence(responses: unknown[]) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) {
      fetchMock.mockRejectedValueOnce(response);
    } else {
      fetchMock.mockResolvedValueOnce(response);
    }
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 退避用的是真實的 setTimeout，測試改跑假時鐘以免真的等 7 秒。 */
async function runWithFakeTimers<T>(run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    // 先把 rejection 收進 settled，否則推進假時鐘的期間會被判成 unhandled rejection。
    const settled = run().then(
      (value) => ({ failed: false, value, error: undefined }),
      (error: unknown) => ({ failed: true, value: undefined as T | undefined, error }),
    );
    await vi.runAllTimersAsync();

    const result = await settled;
    if (result.failed) {
      throw result.error;
    }
    return result.value as T;
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchTwseListedStocks', () => {
  it('retries a 5xx and succeeds on the next attempt', async () => {
    const fetchMock = stubFetchSequence([errorResponse(503), twseOk()]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const entries = await runWithFakeTimers(fetchTwseListedStocks);

    expect(entries).toEqual([{ code: '0050', name: 'ETF50', market: 'TWSE' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a connection failure', async () => {
    const fetchMock = stubFetchSequence([new TypeError('fetch failed'), twseOk()]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runWithFakeTimers(fetchTwseListedStocks);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured number of retries', async () => {
    const fetchMock = stubFetchSequence([
      errorResponse(500),
      errorResponse(500),
      errorResponse(500),
      errorResponse(500),
    ]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(runWithFakeTimers(fetchTwseListedStocks)).rejects.toThrow('HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry a 4xx', async () => {
    const fetchMock = stubFetchSequence([errorResponse(404)]);

    await expect(fetchTwseListedStocks()).rejects.toThrow('HTTP 404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry when a 200 parses to nothing (upstream markup changed)', async () => {
    const fetchMock = stubFetchSequence([okResponse('<html>改版了</html>', 'text/html')]);

    await expect(fetchTwseListedStocks()).rejects.toThrow('來源版型可能已改版');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchTpexListedStocks', () => {
  it('retries an empty payload before succeeding', async () => {
    const fetchMock = stubFetchSequence([okResponse('', 'text/csv'), tpexOk()]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const entries = await runWithFakeTimers(fetchTpexListedStocks);

    expect(entries).toEqual([{ code: '6488', name: '環球晶', market: 'TPEX' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a missing column (upstream schema changed)', async () => {
    const fetchMock = stubFetchSequence([okResponse('公司代號,公司名稱\r\n"6488","環球晶圓"\r\n', 'text/csv')]);

    await expect(fetchTpexListedStocks()).rejects.toThrow('缺少必要欄位');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
