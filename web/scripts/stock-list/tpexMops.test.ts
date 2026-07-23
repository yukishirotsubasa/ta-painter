import { describe, expect, it } from 'vitest';
import { parseCsv, parseTpexMopsCsv } from './tpexMops.ts';

const BOM = '\u{FEFF}';

/** 取自實際下載的 `t187ap03_O.csv` 表頭（完整 33 欄）。 */
const REAL_HEADER =
  '出表日期,公司代號,公司名稱,公司簡稱,外國企業註冊地國,產業別,住址,營利事業統一編號,董事長,總經理,發言人,發言人職稱,代理發言人,總機電話,成立日期,上櫃日期,普通股每股面額,實收資本額,私募股數,特別股,編制財務報表類型,股票過戶機構,過戶電話,過戶地址,簽證會計師事務所,簽證會計師1,簽證會計師2,英文簡稱,英文通訊地址,傳真機號碼,電子郵件信箱,網址,已發行普通股數或TDR原股發行股數';

/** 真實資料列（節錄前 8 欄），保留原始的 BOM、雙引號包欄與 CRLF 換列。 */
const REAL_MOPS_CSV = [
  BOM + REAL_HEADER,
  '"1150722","1240","茂生農經股份有限公司","茂生農經","－ ","33","台北市和平西路一段三十號二樓","18795706"',
  '"1150722","6488","環球晶圓股份有限公司","環球晶","－ ","24","新竹科學園區新竹市工業東二路八號","28113286"',
  '"1150722","7584","樂意傳播股份有限公司","樂意","－ ","32","新北市新店區北新路三段205-3號9樓","53773813"',
  '',
].join('\r\n');

describe('parseTpexMopsCsv', () => {
  it('takes 公司代號 + 公司簡稱 (not 公司名稱) and tags them as TPEX', () => {
    expect(parseTpexMopsCsv(REAL_MOPS_CSV)).toEqual([
      { code: '1240', name: '茂生農經', market: 'TPEX' },
      { code: '6488', name: '環球晶', market: 'TPEX' },
      { code: '7584', name: '樂意', market: 'TPEX' },
    ]);
  });

  it('throws when a required column is missing instead of guessing another column', () => {
    const csv = '出表日期,公司代號,公司名稱\r\n"1150722","1240","茂生農經股份有限公司"\r\n';

    expect(() => parseTpexMopsCsv(csv)).toThrow('缺少必要欄位');
  });

  it('throws when the file is truncated mid-quote', () => {
    const csv = `${REAL_HEADER}\r\n"1150722","1240","茂生農經股份`;

    expect(() => parseTpexMopsCsv(csv)).toThrow('未閉合的引號');
  });

  it('skips records that are too short or have an empty 代號/簡稱', () => {
    const csv = [
      REAL_HEADER,
      '"1150722","1240"',
      '"1150722","","茂生農經股份有限公司","茂生農經"',
      '"1150722","1240","茂生農經股份有限公司",""',
      '"1150722","6488","環球晶圓股份有限公司","環球晶"',
    ].join('\r\n');

    expect(parseTpexMopsCsv(csv)).toEqual([{ code: '6488', name: '環球晶', market: 'TPEX' }]);
  });
});

describe('parseCsv', () => {
  it('keeps commas that live inside a quoted field', () => {
    // 真實的「英文通訊地址」欄值，公司代號 1240。
    const address = '2F.,No.30,Sec. 1,Heping W.Rd.,Zhongzheng Dist.,Taipei City 100028TAIPEI,TAIWAN(R.O.C)';

    expect(parseCsv(`"1240","${address}","02-23671162"\r\n`)).toEqual([
      ['1240', address, '02-23671162'],
    ]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(parseCsv('"a""b",c\r\n')).toEqual([['a"b', 'c']]);
  });

  it('accepts LF, CRLF and lone CR as record separators', () => {
    expect(parseCsv('a,b\nc,d\r\ne,f\rg,h')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
    ]);
  });

  it('drops all-empty records and strips the leading BOM', () => {
    expect(parseCsv(`${BOM}a,b\r\n,\r\n\r\nc,d\r\n`)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps the last record when the file has no trailing newline', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});
