/** 單日 K 線資料，time 格式為 'YYYY-MM-DD'（對齊 lightweight-charts BusinessDay string 格式）。 */
export interface OhlcvBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 查詢區間，start/end 皆為 'YYYY-MM-DD'（西元年），由各 provider 自行轉換為來源所需格式。 */
export interface DateRange {
  start: string;
  end: string;
}

/** 逐月/逐頁查詢進度，loaded/total 為已完成與總請求數（例如月數）。 */
export interface FetchProgress {
  loaded: number;
  total: number;
}

export type FetchProgressCallback = (progress: FetchProgress) => void;

/** 股票資料來源統一介面，TWSE/TPEx/Yahoo provider 皆實作此介面。 */
export interface StockDataProvider {
  readonly id: string;
  readonly label: string;
  fetchDaily(
    stockNo: string,
    range: DateRange,
    onProgress?: FetchProgressCallback,
    signal?: AbortSignal,
  ): Promise<OhlcvBar[]>;
}
