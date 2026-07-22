import type { DateRange, FetchProgressCallback, OhlcvBar, StockDataProvider } from '../types';
import { buildProxyUrl } from './proxy';
import { registerProvider } from './providerRegistry';

/** TPEx 個股日成交資訊（新版站台，需經 proxy）。 */
const TRADING_STOCK_PATH = '/www/zh-tw/afterTrading/tradingStock';

/** TPEx `tradingStock` 回應中 data 每一列的欄位順序（見 fields）。 */
const Field = {
  Date: 0,
  Volume: 1, // 成交仟股（thousands of shares），需 ×1000 轉為股數以對齊 TWSE
  Open: 3,
  High: 4,
  Low: 5,
  Close: 6,
} as const;

/** 成交仟股 -> 股數，讓量能與 TWSE（原始股數）一致。 */
const VOLUME_UNIT = 1000;

interface TradingStockResponse {
  stat?: string;
  tables?: { data?: string[][] }[];
}

/** '2024-09-15' -> '2024/09/01'：TPEx `date` 只決定查詢月份，一次回傳整月。 */
function formatQueryDate(isoDate: string): string {
  const [year, month] = isoDate.split('-');
  return `${year}/${month}/01`;
}

/** '113/09/02'（民國年）-> '2024-09-02'（西元年，補零）。 */
function parseRocDate(rocDate: string): string {
  const [rocYear, month, day] = rocDate.split('/');
  const year = Number(rocYear) + 1911;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** 去除千分位逗號後轉為 number。 */
function parseNumber(raw: string): number {
  return Number(raw.replaceAll(',', ''));
}

function rowToBar(row: string[]): OhlcvBar {
  return {
    time: parseRocDate(row[Field.Date]),
    open: parseNumber(row[Field.Open]),
    high: parseNumber(row[Field.High]),
    low: parseNumber(row[Field.Low]),
    close: parseNumber(row[Field.Close]),
    volume: parseNumber(row[Field.Volume]) * VOLUME_UNIT,
  };
}

/**
 * 單月查詢：`date` 參數只決定查詢月份（回傳整月資料），逐月串接長區間查詢見 throttle.ts。
 * 上櫃股票直連會被 CORS 擋，改走 Worker proxy（見 docs/proxy.md）。
 */
async function fetchDaily(
  stockNo: string,
  range: DateRange,
  onProgress?: FetchProgressCallback,
  signal?: AbortSignal,
): Promise<OhlcvBar[]> {
  const upstreamPath = `${TRADING_STOCK_PATH}?code=${stockNo}&date=${formatQueryDate(range.start)}&id=&response=json`;
  const url = buildProxyUrl('tpex', upstreamPath);

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`TPEx 請求失敗：HTTP ${res.status}`);
  }

  const body = (await res.json()) as TradingStockResponse;
  // 查無此代號時 TPEx 仍回 stat=ok、data 為空陣列，不視為錯誤（回傳空結果，交由上層裁切/快取處理）。
  if (body.stat?.toLowerCase() !== 'ok') {
    throw new Error(`TPEx 查詢失敗：${body.stat}`);
  }

  const rows = body.tables?.[0]?.data ?? [];
  const bars = rows
    .map(rowToBar)
    .filter((bar) => bar.time >= range.start && bar.time <= range.end)
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

  onProgress?.({ loaded: 1, total: 1 });

  return bars;
}

export const TpexProvider: StockDataProvider = {
  id: 'tpex',
  label: '櫃買中心（TPEx）',
  fetchDaily,
};

registerProvider(TpexProvider);
