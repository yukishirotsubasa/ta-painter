import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSettings, loadSettings, saveSettings, type PersistedSettings } from './persistence';

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

const SETTINGS: PersistedSettings = {
  symbol: '2454',
  prov: 'official',
  indicators: [
    { definitionId: 'ma', params: { period: 60, source: 'close', color: '#ff0000' } },
    { definitionId: 'bb', params: {} },
  ],
  useAdjusted: true,
};

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persistence', () => {
  it('returns null before anything is saved', () => {
    expect(loadSettings()).toBeNull();
  });

  it('round-trips saved settings', () => {
    saveSettings(SETTINGS);
    expect(loadSettings()).toEqual(SETTINGS);
  });

  it('overwrites previous settings on save', () => {
    saveSettings(SETTINGS);
    saveSettings({ ...SETTINGS, symbol: '2330', prov: 'yahoo' });
    expect(loadSettings()).toMatchObject({ symbol: '2330', prov: 'yahoo' });
  });

  it('clearSettings removes the stored value', () => {
    saveSettings(SETTINGS);
    clearSettings();
    expect(loadSettings()).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    storage.setItem('settings:v1', '{not json');
    expect(loadSettings()).toBeNull();
  });

  it('defaults useAdjusted to false for legacy settings without the field', () => {
    // 舊版 settings:v1 沒有 useAdjusted：解析成功並補預設 false，而非整包作廢。
    storage.setItem('settings:v1', JSON.stringify({ symbol: '2330', prov: 'yahoo', indicators: [] }));
    expect(loadSettings()).toEqual({ symbol: '2330', prov: 'yahoo', indicators: [], useAdjusted: false });
  });

  it('returns null when the shape fails schema validation', () => {
    // 缺 symbol、prov 非法：整包視為沒存過。
    storage.setItem('settings:v1', JSON.stringify({ prov: 'nope', indicators: [] }));
    expect(loadSettings()).toBeNull();
  });

  it('tolerates absent localStorage (loads null, saves without throwing)', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadSettings()).toBeNull();
    expect(() => saveSettings(SETTINGS)).not.toThrow();
  });

  it('does not throw when setItem fails (e.g. quota exceeded)', () => {
    const throwing = new MemoryStorage();
    throwing.setItem = () => {
      throw new DOMException('QuotaExceededError');
    };
    vi.stubGlobal('localStorage', throwing);
    expect(() => saveSettings(SETTINGS)).not.toThrow();
  });
});
