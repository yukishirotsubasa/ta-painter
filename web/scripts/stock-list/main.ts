import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchTpexListedStocks, fetchTwseListedStocks } from './fetchSources.ts';
import { mergeStockLists, serializeStockList } from './stockList.ts';

const OUTPUT_PATH = fileURLToPath(new URL('../../public/stock-list.json', import.meta.url));

/**
 * 每週由 `.github/workflows/update-stock-list.yml` 執行：抓上市＋上櫃清單合併寫入
 * `web/public/stock-list.json`。任一來源失敗（HTTP 非 2xx／內容空／解析後為空／CSV 缺欄位）
 * 就整體失敗且不寫檔，寧可沿用上一版清單也不要發佈殘缺清單。
 */
async function main(): Promise<void> {
  const [twseEntries, tpexEntries] = await Promise.all([
    fetchTwseListedStocks(),
    fetchTpexListedStocks(),
  ]);

  const entries = mergeStockLists(twseEntries, tpexEntries);
  const content = serializeStockList(entries);
  const current = await readFile(OUTPUT_PATH, 'utf8').catch(() => null);

  if (current === content) {
    console.log(`清單無變動（共 ${entries.length} 檔），不寫檔。`);
    return;
  }

  await writeFile(OUTPUT_PATH, content, 'utf8');
  console.log(
    `已更新 ${OUTPUT_PATH}：上市 ${twseEntries.length} 檔、上櫃 ${tpexEntries.length} 檔，去重後共 ${entries.length} 檔。`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
