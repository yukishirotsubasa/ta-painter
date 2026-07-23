import type { StockListEntry } from './types';

/** symbol1 的每週 workflow 產出並 commit 進 repo，隨 web 一起以靜態檔部署（`base` 之下）。 */
const STOCK_LIST_URL = `${import.meta.env.BASE_URL}stock-list.json`;

let cached: Promise<StockListEntry[]> | null = null;

function isStockListEntry(value: unknown): value is StockListEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<StockListEntry>;
  return (
    typeof entry.code === 'string' &&
    typeof entry.name === 'string' &&
    (entry.market === 'TWSE' || entry.market === 'TPEX')
  );
}

async function fetchStockList(): Promise<StockListEntry[]> {
  const response = await fetch(STOCK_LIST_URL);
  if (!response.ok) throw new Error(`載入股票清單失敗（HTTP ${response.status}）`);

  const parsed = (await response.json()) as unknown;
  if (!Array.isArray(parsed)) throw new Error('股票清單格式不正確：預期為陣列');
  // 逐筆檢查而非整份丟棄：清單若某天多出未知形狀的項目，其餘仍可搜尋。
  return parsed.filter(isStockListEntry);
}

/**
 * 取得全站共用的單一份清單（約 100 KB，只抓一次）。
 * 失敗不快取 rejected promise，讓下次呼叫（例如重新輸入時）可以重試。
 */
export function loadStockList(): Promise<StockListEntry[]> {
  cached ??= fetchStockList().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

/** 測試用：清掉模組層快取。 */
export function resetStockListCache(): void {
  cached = null;
}
