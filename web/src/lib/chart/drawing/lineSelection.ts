import type { DrawnLine } from './drawingController';

/**
 * 側邊欄畫線清單（sidebar3）的選取規則。抽成純函式讓行為可單獨測試，
 * App 只負責把結果套進 state、由 `ChartContainer` 轉成 `highlightLine()`。
 */

/** 清單更新後仍然有效的選取：被刪除或切股清空的線不保留選取狀態。 */
export function keepSelection(selectedId: string | null, lines: DrawnLine[]): string | null {
  if (selectedId === null) return null;
  return lines.some((line) => line.id === selectedId) ? selectedId : null;
}

/** 點清單項的選取切換：再點一次目前已選取的項目即取消選取。 */
export function toggleSelection(selectedId: string | null, id: string): string | null {
  return selectedId === id ? null : id;
}

/** 折疊畫線區塊或整個側邊欄時一律取消選取（線段高亮同時消失）。 */
export function selectionAfterCollapse(
  selectedId: string | null,
  sidebarCollapsed: boolean,
  sectionCollapsed: boolean,
): string | null {
  return sidebarCollapsed || sectionCollapsed ? null : selectedId;
}
