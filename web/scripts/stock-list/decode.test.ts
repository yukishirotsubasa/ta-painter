import { describe, expect, it } from 'vitest';
import { decodeBig5Bytes, extractCharset } from './decode.ts';

/** 取自實際下載的 ISIN 頁面：`2330　台積電`（全形空白 + Big5 中文）的原始位元組。 */
const BIG5_2330 = new Uint8Array([0x32, 0x33, 0x33, 0x30, 0xa1, 0x40, 0xa5, 0x78, 0xbf, 0x6e, 0xb9, 0x71]);

/** 實際 header：`Content-Type: text/html;charset=MS950`，而 MS950 不是合法的 WHATWG label。 */
const REAL_CONTENT_TYPE = 'text/html;charset=MS950';

describe('extractCharset', () => {
  it('reads the charset parameter out of a Content-Type header', () => {
    expect(extractCharset(REAL_CONTENT_TYPE)).toBe('MS950');
    expect(extractCharset('text/csv; charset="utf-8"')).toBe('utf-8');
  });

  it('returns null when there is no charset (or no header at all)', () => {
    expect(extractCharset('text/csv')).toBeNull();
    expect(extractCharset(null)).toBeNull();
    expect(extractCharset(undefined)).toBeNull();
  });
});

describe('decodeBig5Bytes', () => {
  it('falls through the unsupported MS950 label and decodes as Big5', () => {
    expect(decodeBig5Bytes(BIG5_2330, REAL_CONTENT_TYPE)).toBe('2330　台積電');
  });

  it('decodes as Big5 even without any Content-Type hint', () => {
    expect(decodeBig5Bytes(BIG5_2330)).toBe('2330　台積電');
  });

  it('honours a supported header charset ahead of the Big5 chain', () => {
    const utf8 = new TextEncoder().encode('台積電');

    expect(decodeBig5Bytes(utf8, 'text/csv;charset=utf-8')).toBe('台積電');
  });

  it('falls back to latin1 rather than throwing when no candidate encoding fits', () => {
    // 落單的 Big5 首位元組：big5/gbk 在 fatal 模式下都會判錯，只剩 latin1 接得住。
    expect(decodeBig5Bytes(new Uint8Array([0xa1]))).toBe('¡');
  });

  it('never throws on empty input', () => {
    expect(decodeBig5Bytes(new Uint8Array([]))).toBe('');
  });
});
