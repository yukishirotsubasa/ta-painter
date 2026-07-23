import type { SymbolSelection } from './types';

/**
 * 送出代號（Enter／下拉選取／查詢鈕）後的新選擇。
 * 代號沒變時回傳**原物件參考**，讓 React 的狀態不變動、不觸發重新查詢——
 * 否則重按查詢會把 `market` 重設為 `null`，官方源被守門擋下後又得等清單解析完再查一次。
 */
export function applySubmittedCode(prev: SymbolSelection, code: string): SymbolSelection {
  if (prev.code === code) return prev;
  // 新代號的市場別未知，交由 App 回頭查股票清單補上。
  return { code, market: null };
}
