/**
 * TWSE ISIN 頁面回應 Big5 系列編碼（實測 header 為 `Content-Type: text/html;charset=MS950`），
 * 但 `MS950`／`cp950`／`x-windows-950` 都不是 WHATWG Encoding 的合法 label，`new TextDecoder()`
 * 會直接丟 RangeError，因此改用「候選 label 依序嘗試」的解碼鏈而非直接相信 header。
 *
 * 順序刻意讓 big5 排在 gbk 前面：Big5 位元組在 GBK 下多半也「合法」但會解成錯字。
 */
const FALLBACK_LABELS = ['x-windows-950', 'cp950', 'big5', 'gbk'];

/**
 * 全部候選都失敗時的最後手段：永不丟錯，錯誤內容交給上層「解析後 rows 為空」的 gate 攔截。
 *
 * 注意 `fatal: true` 的保護有限——Node 的 Big5/GBK 解碼器會把 0x80–0xFF 的單一位元組
 * 映到私用區（如 0xFF -> U+F8F8）而不丟錯，只有殘缺的雙位元組序列才會判錯，
 * 因此不能把「解碼成功」當成「編碼猜對了」。
 */
const LAST_RESORT_LABEL = 'latin1';

/** 'text/html;charset=MS950' -> 'MS950'；無 charset 時回傳 null。 */
export function extractCharset(contentType: string | null | undefined): string | null {
  const match = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType ?? '');
  return match ? match[1] : null;
}

/** label 不被支援（RangeError）或位元組不合該編碼（fatal 模式下的 TypeError）時回傳 null。 */
function tryDecode(bytes: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** 依「header charset -> 950 系列 -> big5 -> gbk -> latin1」逐一嘗試解碼。 */
export function decodeBig5Bytes(bytes: Uint8Array, contentType?: string | null): string {
  const labels = [extractCharset(contentType), ...FALLBACK_LABELS].filter(
    (label): label is string => label !== null,
  );

  for (const label of labels) {
    const text = tryDecode(bytes, label);
    // 空字串一併視同失敗：解碼器不會為此丟錯，但空內容對後續解析毫無意義。
    if (text) {
      return text;
    }
  }

  return new TextDecoder(LAST_RESORT_LABEL).decode(bytes);
}
