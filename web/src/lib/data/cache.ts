import type { OhlcvBar } from './types';

const KEY_PREFIX = 'ohlcv:';
const INDEX_KEY = 'cache:index';

/** 快取容量門檻（月數），超過時淘汰 lastAccess 最舊的項目。 */
export const MAX_CACHE_ENTRIES = 500;

interface CacheIndexEntry {
  key: string;
  lastAccess: number;
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function cacheKey(providerId: string, stockNo: string, monthLabel: string): string {
  return `${KEY_PREFIX}${providerId}:${stockNo}:${monthLabel}`;
}

/** 'YYYY-MM'，用來判斷某月是否為當月（當月資料視為過期，需重抓）。 */
export function currentMonthLabel(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function readIndex(): CacheIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CacheIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: CacheIndexEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

function touchIndex(key: string): void {
  const entries = readIndex();
  const existing = entries.find((entry) => entry.key === key);
  if (existing) {
    existing.lastAccess = Date.now();
  } else {
    entries.push({ key, lastAccess: Date.now() });
  }
  writeIndex(entries);
}

function removeFromIndex(entries: CacheIndexEntry[], key: string): CacheIndexEntry[] {
  return entries.filter((entry) => entry.key !== key);
}

/** 超過 MAX_CACHE_ENTRIES 時，依 lastAccess 由舊到新淘汰，直到符合容量門檻。 */
function evictIfNeeded(): void {
  let entries = readIndex();
  if (entries.length <= MAX_CACHE_ENTRIES) return;

  const sorted = [...entries].sort((a, b) => a.lastAccess - b.lastAccess);
  const overflow = entries.length - MAX_CACHE_ENTRIES;
  for (const entry of sorted.slice(0, overflow)) {
    localStorage.removeItem(entry.key);
    entries = removeFromIndex(entries, entry.key);
  }
  writeIndex(entries);
}

/**
 * 讀取快取月份資料。當月一律視為過期（回傳 undefined，由呼叫端重抓），
 * 歷史月份只要曾快取即永久有效。命中時會更新 lastAccess（LRU）。
 */
export function getCachedMonth(providerId: string, stockNo: string, monthLabel: string): OhlcvBar[] | undefined {
  if (!hasLocalStorage() || monthLabel === currentMonthLabel()) return undefined;

  const key = cacheKey(providerId, stockNo, monthLabel);
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;

  try {
    const bars = JSON.parse(raw) as OhlcvBar[];
    touchIndex(key);
    return bars;
  } catch {
    localStorage.removeItem(key);
    writeIndex(removeFromIndex(readIndex(), key));
    return undefined;
  }
}

/**
 * 寫入某月完整資料到快取（呼叫端應傳整月資料，而非依查詢區間裁切過的片段，
 * 否則之後其他查詢區間命中同一月份快取會拿到不完整資料）。當月資料不快取，
 * 避免月中抓到的不完整資料在月份結束後被誤判為「已完結歷史月份」。
 */
export function setCachedMonth(providerId: string, stockNo: string, monthLabel: string, bars: OhlcvBar[]): void {
  if (!hasLocalStorage() || monthLabel === currentMonthLabel()) return;

  const key = cacheKey(providerId, stockNo, monthLabel);
  try {
    localStorage.setItem(key, JSON.stringify(bars));
  } catch {
    return;
  }
  touchIndex(key);
  evictIfNeeded();
}

export function clearCache(): void {
  if (!hasLocalStorage()) return;
  for (const entry of readIndex()) {
    localStorage.removeItem(entry.key);
  }
  localStorage.removeItem(INDEX_KEY);
}
