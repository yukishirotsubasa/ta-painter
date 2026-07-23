/** 掛牌市場別：`TWSE` 上市、`TPEX` 上櫃。 */
export type Market = 'TWSE' | 'TPEX';

/** `web/public/stock-list.json` 的單筆結構。 */
export interface StockListEntry {
  code: string;
  name: string;
  market: Market;
}

/**
 * 依 `code` 去重，先到先贏；呼叫端以 `mergeStockLists(twse, tpex)` 讓上市優先於上櫃
 * （少數代號兩邊都有時以上市為準）。原始順序保留，避免每週產生無意義的排序 diff。
 */
export function mergeStockLists(...lists: StockListEntry[][]): StockListEntry[] {
  const byCode = new Map<string, StockListEntry>();
  for (const entry of lists.flat()) {
    if (!byCode.has(entry.code)) {
      byCode.set(entry.code, entry);
    }
  }
  return [...byCode.values()];
}

/**
 * 一筆一行的 JSON：仍是合法 JSON 陣列，但清單增減時 git diff 只會出現異動的那幾行，
 * 便於人工覆核每週自動 commit 的內容。
 */
export function serializeStockList(entries: StockListEntry[]): string {
  return `[\n${entries.map((entry) => JSON.stringify(entry)).join(',\n')}\n]\n`;
}
