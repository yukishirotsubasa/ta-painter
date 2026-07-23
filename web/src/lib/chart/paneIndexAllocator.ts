import type { PaneIndexAllocator } from './indicators/types';

/** allocator 只需要查得到目前 pane 數量，抽成最小介面讓測試能餵 fake chart。 */
export interface PaneCountSource {
  panes(): readonly unknown[];
}

/**
 * 配置 separate-pane 指標用的 pane index（indicator10）。
 *
 * 落點一律取「圖表目前實際的 pane 數量」（至少 `reservedCount`），而不是自維一份已配置集合：
 * lightweight-charts 在某個 pane 的最後一個 series 被移除時會自動刪掉該 pane，
 * 後面的 pane index 會往前遞補，自維計數器會與實際位置對不上。
 * 因此 `release()` 沒有東西要清，維持 no-op 只為相容 `PaneIndexAllocator` 介面。
 */
export function createPaneIndexAllocator(
  chart: PaneCountSource,
  reservedCount: number,
): PaneIndexAllocator {
  return {
    allocate(): number {
      return Math.max(reservedCount, chart.panes().length);
    },
    release(): void {},
  };
}
