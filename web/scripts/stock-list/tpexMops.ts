import type { StockListEntry } from './stockList.ts';

/** 公司名稱含逗號（且欄位被引號包住），不能用 `split(',')`，需要完整的 CSV 狀態機。 */
const CODE_HEADER = '公司代號';
/** 用「簡稱」不用「名稱」：茂生農經 ✔ ／ 茂生農經股份有限公司 ✘。 */
const NAME_HEADER = '公司簡稱';

/** UTF-8 BOM：MOPS CSV 檔頭帶 BOM，未去除會讓第一個欄位名比對不到。 */
const BOM = '\u{FEFF}';

/**
 * 最小可用 CSV parser：`"` 進入引號模式、引號內 `""` 代表字面 `"`、引號外 `,` 分欄，
 * `\n`／`\r\n`／孤立 `\r` 皆視為換列，全空列丟棄。檔尾仍在引號模式代表檔案被截斷。
 */
export function parseCsv(text: string): string[][] {
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    if (record.some((value) => value !== '')) {
      records.push(record);
    }
    record = [];
  };

  while (index < body.length) {
    const char = body[index];

    if (quoted) {
      if (char === '"') {
        if (body[index + 1] === '"') {
          field += '"';
          index += 2;
        } else {
          quoted = false;
          index += 1;
        }
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      index += 1;
    } else if (char === ',') {
      endField();
      index += 1;
    } else if (char === '\r') {
      endRecord();
      index += body[index + 1] === '\n' ? 2 : 1;
    } else if (char === '\n') {
      endRecord();
      index += 1;
    } else {
      field += char;
      index += 1;
    }
  }

  if (quoted) {
    throw new Error('TPEx MOPS CSV 毀損：檔尾有未閉合的引號');
  }
  if (field !== '' || record.length > 0) {
    endRecord();
  }

  return records;
}

/** 解析 MOPS 上櫃公司基本資料 CSV（UTF-8 含 BOM），取代號與簡稱。 */
export function parseTpexMopsCsv(text: string): StockListEntry[] {
  const records = parseCsv(text);
  const header = records[0];
  if (!header) {
    throw new Error('TPEx MOPS CSV 毀損：沒有任何資料列');
  }

  const codeIndex = header.indexOf(CODE_HEADER);
  const nameIndex = header.indexOf(NAME_HEADER);
  // 缺欄位就整體失敗，不改猜其他欄位：猜錯會把錯的名稱悄悄發佈出去。
  if (codeIndex === -1 || nameIndex === -1) {
    throw new Error(
      `TPEx MOPS CSV 缺少必要欄位（${CODE_HEADER}／${NAME_HEADER}），實際欄位：${header.join(',')}`,
    );
  }

  const lastRequiredIndex = Math.max(codeIndex, nameIndex);
  const entries: StockListEntry[] = [];

  for (const record of records.slice(1)) {
    if (record.length <= lastRequiredIndex) {
      continue;
    }

    const code = record[codeIndex].trim();
    const name = record[nameIndex].trim();
    if (!code || !name) {
      continue;
    }

    entries.push({ code, name, market: 'TPEX' });
  }

  return entries;
}
