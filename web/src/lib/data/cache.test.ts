import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CACHE_ENTRIES, clearCache, currentMonthLabel, getCachedMonth, setCachedMonth } from './cache';
import type { OhlcvBar } from './types';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function bar(time: string): OhlcvBar {
  return { time, open: 1, high: 1, low: 1, close: 1, volume: 1 };
}

/** 相對「現在」往前推 monthsAgo 個月的 'YYYY-MM' 標籤，確保不落在當月。 */
function pastMonthLabel(monthsAgo: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cache', () => {
  it('returns undefined on a miss, then the stored bars after set (round-trip)', () => {
    const month = pastMonthLabel(12);
    expect(getCachedMonth('twse', '2330', month)).toBeUndefined();

    const bars = [bar(`${month}-01`), bar(`${month}-02`)];
    setCachedMonth('twse', '2330', month, bars);

    expect(getCachedMonth('twse', '2330', month)).toEqual(bars);
  });

  it('treats the current month as always expired, even right after being set', () => {
    const month = currentMonthLabel();
    setCachedMonth('twse', '2330', month, [bar(`${month}-01`)]);

    expect(getCachedMonth('twse', '2330', month)).toBeUndefined();
  });

  it('does not persist current-month data at all (avoids caching an incomplete month as if it were final)', () => {
    const month = currentMonthLabel();
    setCachedMonth('twse', '2330', month, [bar(`${month}-01`)]);

    expect(storage.length).toBe(0);
  });

  it('keeps historical months isolated per provider and per stock number', () => {
    const month = pastMonthLabel(6);
    setCachedMonth('twse', '2330', month, [bar(`${month}-01`)]);

    expect(getCachedMonth('tpex', '2330', month)).toBeUndefined();
    expect(getCachedMonth('twse', '0050', month)).toBeUndefined();
    expect(getCachedMonth('twse', '2330', month)).toEqual([bar(`${month}-01`)]);
  });

  it('evicts the least-recently-accessed entry once capacity is exceeded, keeping recently-touched entries', () => {
    // Fill to exactly capacity, in order: firstInsertedMonth is the first (and thus, absent any
    // access, the least-recently-used) entry; lastInsertedMonth is the most recently touched.
    for (let i = 0; i < MAX_CACHE_ENTRIES; i += 1) {
      setCachedMonth('twse', '2330', pastMonthLabel(i + 1), [bar('x')]);
    }
    const firstInsertedMonth = pastMonthLabel(1);
    const secondInsertedMonth = pastMonthLabel(2);
    const lastInsertedMonth = pastMonthLabel(MAX_CACHE_ENTRIES);

    // Touch the first-inserted entry so it's no longer the least-recently-accessed one;
    // secondInsertedMonth becomes the new LRU victim.
    expect(getCachedMonth('twse', '2330', firstInsertedMonth)).toBeDefined();

    setCachedMonth('twse', '2330', pastMonthLabel(MAX_CACHE_ENTRIES + 1), [bar('new')]);

    expect(getCachedMonth('twse', '2330', firstInsertedMonth)).toBeDefined();
    expect(getCachedMonth('twse', '2330', lastInsertedMonth)).toBeDefined();
    expect(getCachedMonth('twse', '2330', secondInsertedMonth)).toBeUndefined();
  });

  it('clearCache removes all cached entries and the index', () => {
    const month = pastMonthLabel(3);
    setCachedMonth('twse', '2330', month, [bar(`${month}-01`)]);

    clearCache();

    expect(getCachedMonth('twse', '2330', month)).toBeUndefined();
    expect(storage.length).toBe(0);
  });
});
