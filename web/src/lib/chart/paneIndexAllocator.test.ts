import { describe, expect, it } from 'vitest';
import { createPaneIndexAllocator } from './paneIndexAllocator';

describe('createPaneIndexAllocator', () => {
  it('allocates increasing indices starting from reservedCount', () => {
    const allocator = createPaneIndexAllocator(2);

    expect(allocator.allocate()).toBe(2);
    expect(allocator.allocate()).toBe(3);
    expect(allocator.allocate()).toBe(4);
  });

  it('reuses a released index for the next allocation instead of always growing', () => {
    const allocator = createPaneIndexAllocator(2);

    const a = allocator.allocate();
    const b = allocator.allocate();
    allocator.release(a);

    expect(allocator.allocate()).toBe(a);
    expect(allocator.allocate()).toBe(b + 1);
  });

  it('skips over an index that is still allocated when filling a gap', () => {
    const allocator = createPaneIndexAllocator(2);

    allocator.allocate(); // 2
    allocator.allocate(); // 3
    allocator.release(2);

    expect(allocator.allocate()).toBe(2);
    expect(allocator.allocate()).toBe(4);
  });
});
