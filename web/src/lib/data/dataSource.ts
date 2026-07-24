import type { Market } from '../stock/types';
import { getProvider } from './providers/providerRegistry';
// 以 side-effect 完成 provider 註冊（見 docs/data-layer.md），下方才能用 id 取得實例。
import './providers/tpexProvider';
import './providers/twseProvider';
import './providers/yahooProvider';
import { countMonths, fetchDailyRange } from './throttle';
import type { DateRange, FetchProgressCallback, OhlcvBar, StockDataProvider } from './types';

/**
 * 使用者可選的資料源：
 * - `yahoo`：預設，單次請求取回整段區間（快查），上市／上櫃通用。
 * - `official`：官方源，依市場別路由 TWSE（上市）/ TPEx（上櫃），逐月抓取（慢但為官方數據）。
 */
export type DataSource = 'yahoo' | 'official';

export const DATA_SOURCES: DataSource[] = ['yahoo', 'official'];

export const DEFAULT_DATA_SOURCE: DataSource = 'yahoo';

export const DATA_SOURCE_LABEL: Record<DataSource, string> = {
  yahoo: 'Yahoo（快）',
  official: '官方（TWSE／TPEx）',
};

/**
 * 往前動態載入時一次往前追加的月數。兩源差距來自成本結構：
 * Yahoo 單次請求就能取回整段，補 12 個月與補 1 個月成本相同；
 * 官方源逐月抓取且每月之間有 300–500ms 節流，補 12 個月要等 6 秒，因此縮到 3 個月一批。
 */
export const OLDER_BATCH_MONTHS: Record<DataSource, number> = {
  yahoo: 12,
  official: 3,
};

function providerIdFor(source: DataSource, market: Market | null): string | null {
  if (source === 'yahoo') return 'yahoo';
  if (market === 'TWSE') return 'twse';
  if (market === 'TPEX') return 'tpex';
  // 官方源必須知道市場別才能決定走 TWSE 還是 TPEx。
  return null;
}

/** 依資料源與市場別取得對應 provider；官方源但市場別未知（不在股票清單內）時回傳 null。 */
export function resolveProvider(source: DataSource, market: Market | null): StockDataProvider | null {
  const id = providerIdFor(source, market);
  return id === null ? null : (getProvider(id) ?? null);
}

/** 該次查詢預期的請求數：Yahoo 單次；官方源等於區間月數（快取命中不會減少此估計值）。 */
export function estimateRequestCount(source: DataSource, range: DateRange): number {
  return source === 'yahoo' ? 1 : countMonths(range);
}

/**
 * 資料查詢統一入口：Yahoo 單次請求直接取回整段區間；官方源走逐月節流查詢（含 localStorage 快取）。
 * 節流／限流屬程式內部行為（避免頻繁請求被上游封鎖），不對使用者呈現。
 */
export function fetchBars(
  source: DataSource,
  stockNo: string,
  market: Market | null,
  range: DateRange,
  onProgress?: FetchProgressCallback,
  signal?: AbortSignal,
): Promise<OhlcvBar[]> {
  const provider = resolveProvider(source, market);
  if (!provider) {
    return Promise.reject(new Error(`無法判斷 ${stockNo} 的市場別（不在股票清單內），請改用 Yahoo 資料源`));
  }

  if (source === 'yahoo') {
    return provider.fetchDaily(stockNo, range, onProgress, signal);
  }
  return fetchDailyRange(provider, stockNo, range, onProgress, signal);
}
