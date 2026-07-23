import type { StockListEntry } from './stockList.ts';

/**
 * ISIN 一覽表把所有證券種類放在同一張表，以 `colspan=7` 的分類標題列分段。
 * 只取這三類即可涵蓋一般股票／創新板／全部 ETF（含 00631L、00710B、00980A 等新型代號），
 * 而權證、特別股、ETN、TDR、REIT 因為分類不同會整段跳過。
 *
 * 用分類白名單而非 symbol regex：新型 ETF 代號規則一直在變，靠分類才不必追著改規則。
 */
const CATEGORY_WHITELIST = new Set(['股票', '創新板', 'ETF']);

const CATEGORY_COLSPAN = '7';
const ROW_PATTERN = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_PATTERN = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
/** 實際頁面寫成 `colspan=7 `（無引號、有尾隨空白），故引號與空白都要容忍。 */
const COLSPAN_PATTERN = /\bcolspan\s*=\s*["']?([^"'\s>]+)/i;
/** 代號與簡稱同一格，以全形空白分隔：`2330　台積電`。 */
const ITEM_PATTERN = /^([A-Za-z0-9]+)\s+(.+)$/;

/** 全形空白（U+3000），ISIN 用它分隔代號與簡稱。 */
const FULLWIDTH_SPACE = '\u{3000}';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(raw: string): string {
  return raw.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (matched, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) {
      return String.fromCodePoint(Number(body.slice(1)));
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? matched;
  });
}

/** 去掉儲存格內的 `<B>` 等標記並還原實體字元。 */
function cellText(innerHtml: string): string {
  return decodeEntities(innerHtml.replace(/<[^>]*>/g, ''));
}

/** 全形空白改半形、連續空白壓成一個，讓 `ITEM_PATTERN` 只需處理單一分隔符。 */
function normalizeSpaces(text: string): string {
  return text.replaceAll(FULLWIDTH_SPACE, ' ').replace(/\s+/g, ' ').trim();
}

/** 解析 `C_public.jsp?strMode=2` 的 HTML 表格，僅回傳白名單分類內的上市證券。 */
export function parseTwseIsinHtml(html: string): StockListEntry[] {
  const entries: StockListEntry[] = [];
  let category: string | null = null;

  for (const row of html.matchAll(ROW_PATTERN)) {
    const cells = [...row[1].matchAll(CELL_PATTERN)];
    if (cells.length === 0) {
      continue;
    }

    const [, attributes, innerHtml] = cells[0];
    if (COLSPAN_PATTERN.exec(attributes)?.[1] === CATEGORY_COLSPAN) {
      category = cellText(innerHtml).replace(/\s+/g, '');
      continue;
    }

    // 表頭列出現在第一個分類之前，此時 category 仍是 null，自然被略過。
    if (category === null || !CATEGORY_WHITELIST.has(category)) {
      continue;
    }

    const item = ITEM_PATTERN.exec(normalizeSpaces(cellText(innerHtml)));
    if (!item) {
      continue;
    }

    entries.push({ code: item[1], name: item[2], market: 'TWSE' });
  }

  return entries;
}
