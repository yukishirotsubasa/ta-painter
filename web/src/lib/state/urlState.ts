import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { getIndicator, getIndicatorByUrlCode } from '../chart/indicators/registry';
import type {
  IndicatorDefinition,
  IndicatorParamSchema,
  IndicatorParamValues,
} from '../chart/indicators/types';
import { DEFAULT_TREND_LINE_WIDTH } from '../chart/drawing/trendLinePrimitive';
import {
  shareStateSchema,
  type ShareIndicator,
  type ShareLine,
  type ShareState,
  type ShareTime,
} from './schema';

/**
 * ShareState 混合式編碼（share1）。
 *
 * 流程：`ShareState` →「精簡字串」→ `lz-string.compressToEncodedURIComponent`。
 * 精簡字串先把體積壓到最小（指標短代碼、省略等於預設值的參數、日期去掉分隔符），
 * 再交給 lz-string 壓縮，比直接壓 JSON 短得多。
 *
 * 精簡字串結構（欄位以 `|` 分隔，未來新欄位一律往後接，舊連結解不到就用預設值）：
 *
 * ```text
 * symbol | prov | start~end | indicator,indicator,... | line,line,...
 * ```
 *
 * - `prov`：`y`（yahoo）／`o`（official）
 * - 日期：`YYYYMMDD`
 * - 指標：`code` 或 `code:arg~arg~...`，`code` 為 `IndicatorDefinition.urlCode`，
 *   args 依 `paramsSchema` 順序排列，等於預設值者留空、尾端連續空值直接截掉
 *   （MA 週期 60、來源 volume、紅線 → `ma:60~v~f00`；全預設 → `ma`）
 * - 線段：`t1~p1~t2~p2~color~width`
 *
 * 分隔符用 `~` 而非任務書寫的 `.`：週期／標準差倍數／價格都可能是浮點數，
 * 用 `.` 會與小數點衝突（`bb:20.2.5` 無從判斷是 `20` + `2.5` 還是 `20.2` + `5`）。
 *
 * 解碼**逐項容錯**：單一指標或單一線段格式錯誤只捨棄該項，其餘照常還原；
 * 整體結構壞掉才回傳 `null`。
 */

/** 分享連結的 hash 參數名：`#s=<encoded>`（實際讀寫 hash 由 share2 負責）。 */
export const SHARE_HASH_KEY = 's';

const FIELD_SEP = '|';
const ITEM_SEP = ',';
const ARG_SEP = '~';
const CODE_ARGS_SEP = ':';

const PROVIDER_TO_CODE = { yahoo: 'y', official: 'o' } as const;
const CODE_TO_PROVIDER: Record<string, ShareState['prov']> = { y: 'yahoo', o: 'official' };

/** 解析失敗一律丟這個，由呼叫端決定「捨棄該項」或「整體失敗」。 */
class DecodeError extends Error {}

function fail(message: string): never {
  throw new DecodeError(message);
}

// --- 純量編解碼 ---

function encodeDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function decodeDate(compact: string): string {
  if (!/^\d{8}$/.test(compact)) fail(`bad date: ${compact}`);
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function encodeTime(time: ShareTime): string {
  return typeof time === 'number' ? String(time) : encodeDate(time);
}

/** 8 碼視為日期（epoch 秒數落在 8 碼代表 1970 年，日線情境不可能出現），其餘視為 epoch 秒數。 */
function decodeTime(token: string): ShareTime {
  if (/^\d{8}$/.test(token)) return decodeDate(token);
  const seconds = Number(token);
  if (!Number.isInteger(seconds)) fail(`bad time: ${token}`);
  return seconds;
}

function encodeNumber(value: number): string {
  if (!Number.isFinite(value)) fail(`bad number: ${value}`);
  return String(value);
}

function decodeNumber(token: string): number {
  const value = Number(token);
  if (token === '' || !Number.isFinite(value)) fail(`bad number: ${token}`);
  return value;
}

/** `#rrggbb` → `rgb`（可縮寫時）或 `rrggbb`。 */
function encodeColor(color: string): string {
  const hex = color.slice(1);
  const shorthand = hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5];
  return shorthand ? `${hex[0]}${hex[2]}${hex[4]}` : hex;
}

function decodeColor(token: string): string {
  if (/^[0-9a-f]{3}$/.test(token)) {
    return `#${token[0]}${token[0]}${token[1]}${token[1]}${token[2]}${token[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(token)) return `#${token}`;
  return fail(`bad color: ${token}`);
}

// --- 指標參數 ---

/** enum 值取「足以區分所有選項的最短前綴」，MA source 因此壓成 c/o/h/l/v。 */
function enumPrefixLength(options: readonly { value: string }[]): number {
  const maxLength = Math.max(...options.map((option) => option.value.length), 1);
  for (let length = 1; length < maxLength; length += 1) {
    const prefixes = new Set(options.map((option) => option.value.slice(0, length)));
    if (prefixes.size === options.length) return length;
  }
  return maxLength;
}

function encodeParam(schema: IndicatorParamSchema, value: number | string): string {
  if (schema.type === 'enum') {
    const raw = String(value);
    if (!schema.options.some((option) => option.value === raw)) fail(`bad enum value: ${raw}`);
    return raw.slice(0, enumPrefixLength(schema.options));
  }
  if (schema.type === 'color') return encodeColor(String(value));
  return encodeNumber(typeof value === 'number' ? value : Number(value));
}

function decodeParam(schema: IndicatorParamSchema, token: string): number | string {
  if (schema.type === 'enum') {
    const length = enumPrefixLength(schema.options);
    const match = schema.options.find(
      (option) => option.value.slice(0, length) === token || option.value === token,
    );
    if (!match) fail(`bad enum token: ${token}`);
    return match.value;
  }
  if (schema.type === 'color') return decodeColor(token);
  return decodeNumber(token);
}

/** 等於預設值的參數編成空字串，之後由尾端截掉；缺 key 也視為預設值。 */
function isDefaultParam(schema: IndicatorParamSchema, value: number | string | undefined): boolean {
  if (value === undefined) return true;
  if (schema.type === 'enum' || schema.type === 'color') return String(value) === schema.default;
  return Number(value) === schema.default;
}

// --- 指標 ---

function encodeIndicator(indicator: ShareIndicator): string | null {
  const definition = getIndicator(indicator.definitionId);
  // 未註冊的指標無短代碼可用，只能整條捨棄（不影響其餘指標）。
  if (!definition) return null;

  const args = definition.paramsSchema.map((schema) =>
    isDefaultParam(schema, indicator.params[schema.key]) ? '' : encodeParam(schema, indicator.params[schema.key]),
  );
  while (args.length > 0 && args[args.length - 1] === '') args.pop();

  return args.length === 0 ? definition.urlCode : `${definition.urlCode}${CODE_ARGS_SEP}${args.join(ARG_SEP)}`;
}

/** 依 paramsSchema 補回所有參數：空／缺的位置一律用 registry 預設值。 */
function paramsFromArgs(definition: IndicatorDefinition, args: string[]): IndicatorParamValues {
  const params: IndicatorParamValues = {};
  definition.paramsSchema.forEach((schema, index) => {
    const token = args[index] ?? '';
    params[schema.key] = token === '' ? schema.default : decodeParam(schema, token);
  });
  return params;
}

function decodeIndicator(token: string): ShareIndicator {
  const separatorIndex = token.indexOf(CODE_ARGS_SEP);
  const urlCode = separatorIndex === -1 ? token : token.slice(0, separatorIndex);
  const args = separatorIndex === -1 ? [] : token.slice(separatorIndex + 1).split(ARG_SEP);

  const definition = getIndicatorByUrlCode(urlCode);
  if (!definition) fail(`unknown indicator code: ${urlCode}`);

  return { definitionId: definition.id, params: paramsFromArgs(definition, args) };
}

// --- 線段 ---

function encodeLine(line: ShareLine): string {
  const [from, to] = line.points;
  return [
    encodeTime(from.time),
    encodeNumber(from.price),
    encodeTime(to.time),
    encodeNumber(to.price),
    encodeColor(line.color),
    encodeNumber(line.width),
  ].join(ARG_SEP);
}

function decodeLine(token: string): ShareLine {
  const parts = token.split(ARG_SEP);
  if (parts.length < 5) fail(`bad line: ${token}`);
  const [t1, p1, t2, p2, color, width] = parts;
  return {
    points: [
      { time: decodeTime(t1), price: decodeNumber(p1) },
      { time: decodeTime(t2), price: decodeNumber(p2) },
    ],
    color: decodeColor(color),
    // width 尚未開放 UI 調整，舊連結可能沒有這一欄，缺就用預設線寬。
    width: width === undefined || width === '' ? DEFAULT_TREND_LINE_WIDTH : decodeNumber(width),
  };
}

/** 逐項解析，單項失敗只捨棄該項（不影響其餘與整體）。 */
function decodeItems<T>(field: string | undefined, decodeOne: (token: string) => T): T[] {
  if (!field) return [];
  const items: T[] = [];
  for (const token of field.split(ITEM_SEP)) {
    if (token === '') continue;
    try {
      items.push(decodeOne(token));
    } catch {
      // 單一指標／線段壞掉不影響其餘項目與整體還原。
    }
  }
  return items;
}

// --- 對外 API ---

/**
 * `ShareState` → 可直接放進 URL hash 的字串。
 * 輸入會先經 `shareStateSchema` 驗證（不合法即丟例外，屬呼叫端 bug）；
 * 未註冊的指標會被略過，其餘照常編碼。
 */
export function encodeShareState(state: ShareState): string {
  const valid = shareStateSchema.parse(state);
  const payload = [
    valid.symbol,
    PROVIDER_TO_CODE[valid.prov],
    `${encodeDate(valid.range.start)}${ARG_SEP}${encodeDate(valid.range.end)}`,
    valid.indicators.map(encodeIndicator).filter((token) => token !== null).join(ITEM_SEP),
    valid.lines.map(encodeLine).join(ITEM_SEP),
  ].join(FIELD_SEP);

  return compressToEncodedURIComponent(payload);
}

/**
 * 分享字串 → `ShareState`；整體結構壞掉（解壓失敗、欄位不足、代號／資料源／區間不合法）回傳 `null`，
 * 單一指標或線段壞掉則捨棄該項後照常回傳其餘內容。任何情況都不會拋出未捕捉例外。
 */
export function decodeShareState(encoded: string): ShareState | null {
  try {
    const payload = decompressFromEncodedURIComponent(encoded);
    if (!payload) return null;

    const [symbol, provCode, range, indicators, lines] = payload.split(FIELD_SEP);
    const prov = CODE_TO_PROVIDER[provCode ?? ''];
    if (!prov) return null;

    const [start, end] = (range ?? '').split(ARG_SEP);
    if (start === undefined || end === undefined) return null;

    return shareStateSchema.parse({
      symbol,
      prov,
      range: { start: decodeDate(start), end: decodeDate(end) },
      indicators: decodeItems(indicators, decodeIndicator),
      lines: decodeItems(lines, decodeLine),
    });
  } catch {
    return null;
  }
}
