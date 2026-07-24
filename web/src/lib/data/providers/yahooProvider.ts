import type { DateRange, FetchProgressCallback, OhlcvBar, StockDataProvider } from '../types';
import { buildProxyUrl } from './proxy';
import { registerProvider } from './providerRegistry';

const CHART_PATH = '/v8/finance/chart';

/**
 * 依台股代號嘗試的 Yahoo symbol 後綴順序：上市 `.TW`、上櫃 `.TWO`。
 * provider 介面只拿得到 stockNo（無市場別），因此逐一嘗試、取第一個有資料的後綴
 * （錯的後綴 Yahoo 回 404 + chart.error，見 docs/proxy.md 實測）。
 */
const SYMBOL_SUFFIXES = ['.TW', '.TWO'] as const;

const SECONDS_PER_DAY = 86400;

interface YahooChartResponse {
  chart?: {
    result?: {
      meta?: { gmtoffset?: number };
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
        /** 還原收盤序列，與 timestamp/quote 同索引；`&events=div|split` 時回傳（見 fetchDaily）。 */
        adjclose?: {
          adjclose?: (number | null)[];
        }[];
      };
    }[];
    error?: { code?: string; description?: string } | null;
  };
}

/** 'YYYY-MM-DD' -> 當日 00:00 UTC 的 Unix 秒數。 */
function isoToUnix(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`) / 1000;
}

/** Unix 秒數（UTC）+ 當地時區偏移 -> 當地日期 'YYYY-MM-DD'。 */
function unixToLocalDate(unixSeconds: number, gmtOffsetSeconds: number): string {
  return new Date((unixSeconds + gmtOffsetSeconds) * 1000).toISOString().slice(0, 10);
}

type ChartResult = NonNullable<NonNullable<YahooChartResponse['chart']>['result']>[number];

function resultToBars(result: ChartResult, range: DateRange): OhlcvBar[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose;
  const gmtOffset = result.meta?.gmtoffset ?? 0;
  if (!quote || timestamps.length === 0) {
    return [];
  }

  const bars: OhlcvBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    // Yahoo 對停牌/缺值的日期會給 null，整列略過。
    if (open == null || high == null || low == null || close == null || volume == null) {
      continue;
    }
    const time = unixToLocalDate(timestamps[i], gmtOffset);
    if (time < range.start || time > range.end) {
      continue;
    }
    // adjclose 缺值（null／該序列不存在）時留 undefined，「使用還原價」會退回原始價。
    const adj = adjclose?.[i];
    bars.push({ time, open, high, low, close, volume, ...(adj == null ? {} : { adjClose: adj }) });
  }

  return bars.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/**
 * 單次查詢即可取得整段區間（不需逐月串接）。依 SYMBOL_SUFFIXES 逐一嘗試後綴，
 * 取第一個回傳有效 result 的；全部失敗才 throw。走 Worker proxy（見 docs/proxy.md）。
 */
async function fetchDaily(
  stockNo: string,
  range: DateRange,
  onProgress?: FetchProgressCallback,
  signal?: AbortSignal,
): Promise<OhlcvBar[]> {
  const period1 = isoToUnix(range.start);
  // period2 為排他上界，加一天確保含 range.end 當日。
  const period2 = isoToUnix(range.end) + SECONDS_PER_DAY;

  let lastError = '';
  for (const suffix of SYMBOL_SUFFIXES) {
    // events=div|split 讓回應附帶 indicators.adjclose（還原收盤），供「使用還原價」計算還原因子。
    const upstreamPath = `${CHART_PATH}/${stockNo}${suffix}?period1=${period1}&period2=${period2}&interval=1d&events=div|split`;
    const res = await fetch(buildProxyUrl('yahoo', upstreamPath), { signal });
    const body = (await res.json().catch(() => ({}))) as YahooChartResponse;

    const result = body.chart?.result?.[0];
    if (result) {
      const bars = resultToBars(result, range);
      onProgress?.({ loaded: 1, total: 1 });
      return bars;
    }
    lastError = body.chart?.error?.description ?? `HTTP ${res.status}`;
  }

  throw new Error(`Yahoo 查詢失敗（${stockNo}）：${lastError}`);
}

export const YahooProvider: StockDataProvider = {
  id: 'yahoo',
  label: 'Yahoo Finance',
  fetchDaily,
};

registerProvider(YahooProvider);
