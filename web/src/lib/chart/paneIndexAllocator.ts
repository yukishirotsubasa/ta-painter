import type { PaneIndexAllocator } from './indicators/types';

/** 從 `reservedCount` 開始配置 separate-pane 指標用的 pane index，`release()` 後該 index 可再被配置。 */
export function createPaneIndexAllocator(reservedCount: number): PaneIndexAllocator {
  const allocated = new Set<number>();

  return {
    allocate(): number {
      let index = reservedCount;
      while (allocated.has(index)) {
        index += 1;
      }
      allocated.add(index);
      return index;
    },
    release(paneIndex: number): void {
      allocated.delete(paneIndex);
    },
  };
}
