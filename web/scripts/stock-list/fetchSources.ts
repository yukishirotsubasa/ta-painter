import { decodeBig5Bytes } from './decode.ts';
import type { StockListEntry } from './stockList.ts';
import { parseTpexMopsCsv } from './tpexMops.ts';
import { parseTwseIsinHtml } from './twseIsin.ts';

/** 上市：ISIN 一覽表（HTML，Big5 系列編碼）。 */
export const TWSE_ISIN_URL = 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=2';

/**
 * 上櫃：MOPS 上櫃公司基本資料（CSV，UTF-8）。
 * 不走 ISIN `strMode=4`：MOPS CSV 的編碼與欄位結構穩定得多。
 */
export const TPEX_MOPS_CSV_URL = 'https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv';

const REQUEST_HEADERS: Record<string, string> = {
  'Accept-Language': 'zh-TW,zh;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

/**
 * 重試間隔（指數退避）；長度即重試次數，總嘗試次數為長度 + 1。
 * 排程一週才跑一次，上游一次抽風就等於整週不更新，值得多花幾秒重試。
 */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

/** 只有暫時性故障才重試：4xx（除了 429）與解析失敗重試幾次也不會變好，直接失敗比較快看到問題。 */
class RetryableFetchError extends Error {}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FetchedPayload {
  bytes: Uint8Array;
  contentType: string | null;
}

/** 一律取 bytes 而非 `res.text()`：Big5 來源交給自訂解碼鏈處理，不能讓 fetch 自行猜編碼。 */
async function fetchBytesOnce(url: string, label: string): Promise<FetchedPayload> {
  let response: Response;
  try {
    response = await fetch(url, { headers: REQUEST_HEADERS });
  } catch (cause) {
    // DNS／連線／逾時：fetch 本身丟錯，一律視為暫時性故障。
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new RetryableFetchError(`${label} 連線失敗：${detail}`);
  }

  if (!response.ok) {
    const message = `${label} 下載失敗：HTTP ${response.status}`;
    throw isRetryableStatus(response.status) ? new RetryableFetchError(message) : new Error(message);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new RetryableFetchError(`${label} 下載失敗：回應內容為空`);
  }

  return { bytes, contentType: response.headers.get('Content-Type') };
}

async function fetchBytes(url: string, label: string): Promise<FetchedPayload> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchBytesOnce(url, label);
    } catch (error) {
      const delayMs = RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined || !(error instanceof RetryableFetchError)) {
        throw error;
      }

      console.warn(
        `${error.message}；${delayMs}ms 後重試（第 ${attempt + 1}/${RETRY_DELAYS_MS.length} 次）`,
      );
      await sleep(delayMs);
    }
  }
}

/**
 * 「HTTP 200 且解析成功但 rows 為空」必須當失敗：這是來源改版最常見的失效樣態，
 * 若放行就會把空清單 commit 回 repo 並發佈出去。
 */
function assertNotEmpty(entries: StockListEntry[], label: string): StockListEntry[] {
  if (entries.length === 0) {
    throw new Error(`${label} 解析後沒有任何標的：來源版型可能已改版`);
  }
  return entries;
}

export async function fetchTwseListedStocks(): Promise<StockListEntry[]> {
  const { bytes, contentType } = await fetchBytes(TWSE_ISIN_URL, 'TWSE ISIN');
  return assertNotEmpty(parseTwseIsinHtml(decodeBig5Bytes(bytes, contentType)), 'TWSE ISIN');
}

export async function fetchTpexListedStocks(): Promise<StockListEntry[]> {
  const { bytes } = await fetchBytes(TPEX_MOPS_CSV_URL, 'TPEx MOPS');
  return assertNotEmpty(parseTpexMopsCsv(new TextDecoder('utf-8').decode(bytes)), 'TPEx MOPS');
}
