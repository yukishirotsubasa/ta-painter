/** 掛牌市場別：`TWSE` 上市、`TPEX` 上櫃。與 `web/scripts/stock-list/stockList.ts` 的定義一致。 */
export type Market = 'TWSE' | 'TPEX';

/** `web/public/stock-list.json` 的單筆結構（由 symbol1 的每週 workflow 產出）。 */
export interface StockListEntry {
  code: string;
  name: string;
  market: Market;
}

/**
 * 使用者目前選定的股票。`market` 為 `null` 代表代號不在清單內（手動輸入的冷門/新代號，
 * 或清單尚未載入完成）；sidebar2 的官方源自動路由屆時無法決定要走 TWSE 還是 TPEx。
 */
export interface SymbolSelection {
  code: string;
  market: Market | null;
}

/** 市場別的中文顯示名稱。 */
export const MARKET_LABEL: Record<Market, string> = {
  TWSE: '上市',
  TPEX: '上櫃',
};
