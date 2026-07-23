import { describe, expect, it } from 'vitest';
import { createPaneIndexAllocator } from './paneIndexAllocator';

/**
 * 模擬 lightweight-charts 的 pane 行為：pane 只以「數量」表示，
 * 移除中間的 pane 時後面的 index 會往前遞補（等同陣列刪除）。
 */
function fakeChart(reservedCount: number) {
  const panes: string[] = Array.from({ length: reservedCount }, (_, i) => `reserved-${i}`);

  return {
    chart: { panes: () => panes },
    /** 模擬 addSeries(..., paneIndex) 建立新 pane。 */
    addPane(label: string, paneIndex: number): void {
      panes[paneIndex] = label;
    },
    /** 模擬該 pane 最後一個 series 被移除，函式庫自動刪除該 pane。 */
    removePane(label: string): void {
      panes.splice(panes.indexOf(label), 1);
    },
    labels: panes,
  };
}

describe('createPaneIndexAllocator', () => {
  it('allocates the next index above the reserved panes', () => {
    const fake = fakeChart(2);
    const allocator = createPaneIndexAllocator(fake.chart, 2);

    expect(allocator.allocate()).toBe(2);
    fake.addPane('a', 2);
    expect(allocator.allocate()).toBe(3);
    fake.addPane('b', 3);
    expect(allocator.allocate()).toBe(4);
  });

  it('reuses the freed index after a pane is added, removed and added again', () => {
    const fake = fakeChart(2);
    const allocator = createPaneIndexAllocator(fake.chart, 2);

    const first = allocator.allocate();
    fake.addPane('macd', first);
    allocator.release(first);
    fake.removePane('macd');

    expect(allocator.allocate()).toBe(first);
  });

  it('tracks the shift when the earlier of two separate panes is removed', () => {
    const fake = fakeChart(2);
    const allocator = createPaneIndexAllocator(fake.chart, 2);

    const macdIndex = allocator.allocate();
    fake.addPane('macd', macdIndex);
    const rsiIndex = allocator.allocate();
    fake.addPane('rsi', rsiIndex);
    expect([macdIndex, rsiIndex]).toEqual([2, 3]);

    // 移除前面的 MACD pane，RSI 由 3 遞補到 2；下一個配置必須是 3 而非 4。
    allocator.release(macdIndex);
    fake.removePane('macd');
    expect(fake.labels.indexOf('rsi')).toBe(2);

    expect(allocator.allocate()).toBe(3);
  });

  it('never allocates below reservedCount even if the chart reports fewer panes', () => {
    const allocator = createPaneIndexAllocator({ panes: () => [] }, 2);

    expect(allocator.allocate()).toBe(2);
  });
});
