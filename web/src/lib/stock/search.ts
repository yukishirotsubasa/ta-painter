import type { StockListEntry } from './types';

/** 下拉建議最多顯示幾筆。 */
export const DEFAULT_SUGGESTION_LIMIT = 8;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 比對優先序（數字越小越前面）：代號開頭 > 名稱開頭 > 代號包含 > 名稱包含，不符者回傳 null。
 * 只做「開頭/包含」而非跳字模糊比對：清單有 2200+ 檔，跳字比對會讓「台積」之類的查詢
 * 帶出一堆不相干結果，反而更難選到目標。
 */
function rank(entry: StockListEntry, query: string): number | null {
  const code = entry.code.toLowerCase();
  const name = entry.name.toLowerCase();
  if (code.startsWith(query)) return 0;
  if (name.startsWith(query)) return 1;
  if (code.includes(query)) return 2;
  if (name.includes(query)) return 3;
  return null;
}

/** 以代號或名稱搜尋建議清單；空查詢回傳空陣列（不顯示下拉）。同分者保持清單原始順序（依代號遞增）。 */
export function searchStocks(
  entries: StockListEntry[],
  query: string,
  limit: number = DEFAULT_SUGGESTION_LIMIT,
): StockListEntry[] {
  const normalized = normalize(query);
  if (!normalized) return [];

  const matched: { entry: StockListEntry; rank: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const matchRank = rank(entry, normalized);
    if (matchRank !== null) matched.push({ entry, rank: matchRank, index });
  });

  matched.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return matched.slice(0, limit).map((item) => item.entry);
}

/** 依代號取完整清單資料（大小寫不敏感，讓使用者輸入 `00631l` 也能對到 `00631L`）。 */
export function findByCode(entries: StockListEntry[], code: string): StockListEntry | undefined {
  const normalized = normalize(code);
  if (!normalized) return undefined;
  return entries.find((entry) => entry.code.toLowerCase() === normalized);
}

/** 名稱開頭完全符合的第一筆（清單原始順序，即代號較小者優先）。 */
export function findByNamePrefix(entries: StockListEntry[], query: string): StockListEntry | undefined {
  const normalized = normalize(query);
  if (!normalized) return undefined;
  return entries.find((entry) => entry.name.toLowerCase().startsWith(normalized));
}

/** 代號只可能是英數（含 `00631L` 這類帶字母的 ETF）；出現其他字元就是使用者在打名稱。 */
function isCodeLike(value: string): boolean {
  return /^[0-9a-z]+$/i.test(value);
}

/**
 * 決定「送出」要查哪個代號，回傳 null 代表不是可查的目標、呼叫端應擋下不刷新資料。
 *
 * 依序：清單內的代號 > 看起來像代號就原樣放行（清單每週更新，新代號可能還沒進清單）>
 * 名稱開頭完全符合的第一筆。中文名稱沒對到任何股票時回 null，避免把「台積電」直接
 * 當 symbol 丟去資料源查詢（等三秒才拿到「沒有符合條件的資料」）。
 */
export function resolveSubmitCode(entries: StockListEntry[], raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const byCode = findByCode(entries, trimmed);
  if (byCode) return byCode.code;
  if (isCodeLike(trimmed)) return trimmed;

  return findByNamePrefix(entries, trimmed)?.code ?? null;
}
