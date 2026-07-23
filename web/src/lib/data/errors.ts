/**
 * 資料層錯誤分類：三個 provider 都只 throw 一般 Error（訊息含來源與原因），
 * 這裡以純函式從錯誤訊息判別類型，讓使用端決定要不要追加「資料源可能失效」提示。
 */

/**
 * - `upstream-blocked`：上游被擋／掛掉（HTTP 403/429/5xx、fetch 網路錯誤、proxy 無回應）。
 * - `no-data`：請求成功但查無資料（代號不存在、區間無交易日）。
 * - `unknown`：其餘（含程式內部錯誤）。
 */
export type DataErrorKind = 'upstream-blocked' | 'no-data' | 'unknown';

/** fetch 本身失敗（DNS／連線中斷／proxy 無回應）在各瀏覽器的訊息樣態。 */
const NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|network request failed|load failed/i;

/** provider 把上游狀態碼帶進訊息（如 `TPEx 請求失敗：HTTP 403`）。 */
const HTTP_STATUS_PATTERN = /HTTP (\d{3})/;

/** TWSE／TPEx 的 `stat` 非 OK、Yahoo 的 chart.error（皆為請求成功但查無資料）。 */
const QUERY_FAILED_PATTERN = /查詢失敗/;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 由 HTTP 狀態碼判別；null 表示此狀態碼無法歸類。 */
function classifyStatus(status: number): DataErrorKind | null {
  if (status === 403 || status === 429 || status >= 500) return 'upstream-blocked';
  // Yahoo 對不存在的 symbol 回 404，屬查無資料而非被擋。
  if (status === 404) return 'no-data';
  return null;
}

/** 錯誤分類。順序重要：訊息可能同時含狀態碼與「查詢失敗」字樣（如 Yahoo），狀態碼優先。 */
export function classifyDataError(err: unknown): DataErrorKind {
  // fetch 失敗在瀏覽器一律是 TypeError，訊息文字則各家不同。
  if (err instanceof TypeError) return 'upstream-blocked';

  const message = messageOf(err);
  if (NETWORK_ERROR_PATTERN.test(message)) return 'upstream-blocked';

  const status = HTTP_STATUS_PATTERN.exec(message);
  if (status) {
    const kind = classifyStatus(Number(status[1]));
    if (kind) return kind;
  }

  if (QUERY_FAILED_PATTERN.test(message)) return 'no-data';

  return 'unknown';
}
