import type { DateRange, FetchProgressCallback, OhlcvBar, StockDataProvider } from '../types';
import { registerProvider } from './providerRegistry';

const STOCK_DAY_URL = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';

/** TWSE `STOCK_DAY` 回應中 data 每一列的欄位順序（見 fields）。 */
const Field = {
  Date: 0,
  Volume: 1,
  Open: 3,
  High: 4,
  Low: 5,
  Close: 6,
} as const;

interface StockDayResponse {
  stat: string;
  data?: string[][];
}

function formatQueryDate(isoDate: string): string {
  return isoDate.replaceAll('-', '');
}

/** '113/09/02'（民國年）-> '2024-09-02'（西元年，補零）。 */
function parseRocDate(rocDate: string): string {
  const [rocYear, month, day] = rocDate.split('/');
  const year = Number(rocYear) + 1911;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** 去除千分位逗號後轉為 number，'X0.00' 等前綴符號欄位不會用到此函式。 */
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
    volume: parseNumber(row[Field.Volume]),
  };
}

/**
 * 單月查詢：STOCK_DAY 的 `date` 參數只決定查詢月份（回傳整月資料），
 * 逐月串接長區間查詢見 data3。
 */
async function fetchDaily(
  stockNo: string,
  range: DateRange,
  onProgress?: FetchProgressCallback,
  signal?: AbortSignal,
): Promise<OhlcvBar[]> {
  const url = `${STOCK_DAY_URL}?response=json&date=${formatQueryDate(range.start)}&stockNo=${stockNo}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`TWSE 請求失敗：HTTP ${res.status}`);
  }

  const body = (await res.json()) as StockDayResponse;
  if (body.stat !== 'OK' || !body.data) {
    throw new Error(`TWSE 查詢失敗：${body.stat}`);
  }

  const bars = body.data
    .map(rowToBar)
    .filter((bar) => bar.time >= range.start && bar.time <= range.end)
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

  onProgress?.({ loaded: 1, total: 1 });

  return bars;
}

export const TwseProvider: StockDataProvider = {
  id: 'twse',
  label: '證交所（TWSE）',
  fetchDaily,
};

registerProvider(TwseProvider);
