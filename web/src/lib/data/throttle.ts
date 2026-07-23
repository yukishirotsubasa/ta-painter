import { getCachedMonth, setCachedMonth } from './cache';
import type { DateRange, FetchProgressCallback, OhlcvBar, StockDataProvider } from './types';

const MIN_INTERVAL_MS = 300;
const MAX_INTERVAL_MS = 500;

function throttleDelayMs(): number {
  return MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
}

function abortError(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException('Aborted', 'AbortError');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortError(signal));
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 'YYYY-MM' 月份標籤清單，依查詢區間展開，起訖月皆含且無缺漏無重複。 */
function listMonths(range: DateRange): string[] {
  const [startYear, startMonth] = range.start.split('-').map(Number);
  const [endYear, endMonth] = range.end.split('-').map(Number);

  const months: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** 查詢區間涵蓋的月數（即逐月抓取時的請求次數上限），起訖月皆含。 */
export function countMonths(range: DateRange): number {
  return listMonths(range).length;
}

/** 該月整月的 DateRange（不裁切），用於向 provider 查詢與寫入快取，確保快取內容為完整月份。 */
function fullMonthRange(monthLabel: string): DateRange {
  const [year, month] = monthLabel.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${monthLabel}-01`,
    end: `${monthLabel}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** 單月查詢用的 DateRange，起訖月的頭尾裁切到整體查詢區間內。 */
function monthRange(monthLabel: string, overallRange: DateRange): DateRange {
  const { start: monthStart, end: monthEnd } = fullMonthRange(monthLabel);

  return {
    start: monthStart > overallRange.start ? monthStart : overallRange.start,
    end: monthEnd < overallRange.end ? monthEnd : overallRange.end,
  };
}

function clipToRange(bars: OhlcvBar[], range: DateRange): OhlcvBar[] {
  return bars.filter((bar) => bar.time >= range.start && bar.time <= range.end);
}

/**
 * 依區間逐月序列化呼叫 `provider.fetchDaily`，每次請求間隔 300–500ms 節流，
 * 並透過 onProgress 回報已完成/總月數。可用 signal 中途取消，取消時佇列立即停止。
 */
export async function fetchDailyRange(
  provider: StockDataProvider,
  stockNo: string,
  range: DateRange,
  onProgress?: FetchProgressCallback,
  signal?: AbortSignal,
): Promise<OhlcvBar[]> {
  const months = listMonths(range);
  const bars: OhlcvBar[] = [];

  for (let index = 0; index < months.length; index += 1) {
    if (signal?.aborted) {
      throw abortError(signal);
    }

    const monthLabel = months[index];
    const cached = getCachedMonth(provider.id, stockNo, monthLabel);

    let monthBars: OhlcvBar[];
    if (cached) {
      monthBars = cached;
    } else {
      monthBars = await provider.fetchDaily(stockNo, fullMonthRange(monthLabel), undefined, signal);
      setCachedMonth(provider.id, stockNo, monthLabel, monthBars);
    }
    bars.push(...clipToRange(monthBars, monthRange(monthLabel, range)));

    onProgress?.({ loaded: index + 1, total: months.length, message: `已載入 ${monthLabel}` });

    if (index < months.length - 1 && !cached) {
      await sleep(throttleDelayMs(), signal);
    }
  }

  return bars;
}
