import { describe, expect, it } from 'vitest';
import { findByCode, findByNamePrefix, resolveSubmitCode, searchStocks } from './search';
import type { StockListEntry } from './types';

// 取自實際 web/public/stock-list.json 的片段（含上市/上櫃、ETF、名稱含「-創」的創新板股票）。
const ENTRIES: StockListEntry[] = [
  { code: '0050', name: '元大台灣50', market: 'TWSE' },
  { code: '00631L', name: '元大台灣50正2', market: 'TWSE' },
  { code: '2233', name: '宇隆', market: 'TWSE' },
  { code: '2254', name: '巨鎧精密-創', market: 'TWSE' },
  { code: '2330', name: '台積電', market: 'TWSE' },
  { code: '2337', name: '旺宏', market: 'TWSE' },
  { code: '3374', name: '精材', market: 'TWSE' },
  { code: '5347', name: '世界', market: 'TPEX' },
  { code: '6488', name: '環球晶', market: 'TPEX' },
  { code: '8942', name: '森鉅', market: 'TPEX' },
];

describe('searchStocks', () => {
  it('matches code fragments anywhere in the code', () => {
    const codes = searchStocks(ENTRIES, '233').map((entry) => entry.code);
    expect(codes).toContain('2330');
    expect(codes).toEqual(['2330', '2337', '2233']);
  });

  it('matches name fragments', () => {
    expect(searchStocks(ENTRIES, '台積')).toEqual([{ code: '2330', name: '台積電', market: 'TWSE' }]);
  });

  it('ranks code prefix > name prefix > code contains > name contains', () => {
    const list: StockListEntry[] = [
      { code: '9999', name: '包含50在名稱中', market: 'TWSE' },
      { code: '1150', name: '甲公司', market: 'TWSE' },
      { code: '2222', name: '50開頭的名稱', market: 'TWSE' },
      { code: '5011', name: '乙公司', market: 'TWSE' },
    ];
    expect(searchStocks(list, '50').map((entry) => entry.code)).toEqual(['5011', '2222', '1150', '9999']);
  });

  it('keeps original list order among equally ranked matches', () => {
    const codes = searchStocks(ENTRIES, '00').map((entry) => entry.code);
    expect(codes).toEqual(['0050', '00631L']);
  });

  it('is case-insensitive on codes with letters', () => {
    expect(searchStocks(ENTRIES, '00631l').map((entry) => entry.code)).toEqual(['00631L']);
  });

  it('trims the query and returns nothing for a blank one', () => {
    expect(searchStocks(ENTRIES, '  2330  ').map((entry) => entry.code)).toEqual(['2330']);
    expect(searchStocks(ENTRIES, '')).toEqual([]);
    expect(searchStocks(ENTRIES, '   ')).toEqual([]);
  });

  it('returns nothing when no code or name matches', () => {
    expect(searchStocks(ENTRIES, '找不到')).toEqual([]);
  });

  it('caps the result count at the limit', () => {
    const many: StockListEntry[] = Array.from({ length: 30 }, (_, index) => ({
      code: `1${String(index).padStart(3, '0')}`,
      name: `測試${index}`,
      market: 'TWSE',
    }));
    expect(searchStocks(many, '1')).toHaveLength(8);
    expect(searchStocks(many, '1', 3)).toHaveLength(3);
  });
});

describe('findByCode', () => {
  it('resolves the market of an exact code', () => {
    expect(findByCode(ENTRIES, '6488')?.market).toBe('TPEX');
    expect(findByCode(ENTRIES, '2330')?.market).toBe('TWSE');
  });

  it('normalizes case and surrounding spaces', () => {
    expect(findByCode(ENTRIES, ' 00631l ')?.code).toBe('00631L');
  });

  it('does not match on a code fragment', () => {
    expect(findByCode(ENTRIES, '233')).toBeUndefined();
    expect(findByCode(ENTRIES, '')).toBeUndefined();
  });
});

describe('findByNamePrefix', () => {
  it('takes the first entry whose name starts with the query', () => {
    const list: StockListEntry[] = [
      { code: '1101', name: '台泥', market: 'TWSE' },
      { code: '2330', name: '台積電', market: 'TWSE' },
      { code: '3005', name: '神基台積', market: 'TWSE' },
    ];
    expect(findByNamePrefix(list, '台積')?.code).toBe('2330');
    expect(findByNamePrefix(list, '台')?.code).toBe('1101');
  });

  it('ignores names that only contain the query in the middle', () => {
    expect(findByNamePrefix(ENTRIES, '積電')).toBeUndefined();
    expect(findByNamePrefix(ENTRIES, '')).toBeUndefined();
  });
});

describe('resolveSubmitCode', () => {
  it('normalizes a code that exists in the list', () => {
    expect(resolveSubmitCode(ENTRIES, ' 00631l ')).toBe('00631L');
    expect(resolveSubmitCode(ENTRIES, '2330')).toBe('2330');
  });

  it('lets an unknown but code-shaped input through (list is only refreshed weekly)', () => {
    expect(resolveSubmitCode(ENTRIES, '9999')).toBe('9999');
    expect(resolveSubmitCode([], '2330')).toBe('2330');
  });

  it('resolves a full name prefix to its code', () => {
    expect(resolveSubmitCode(ENTRIES, '台積')).toBe('2330');
    expect(resolveSubmitCode(ENTRIES, '台積電')).toBe('2330');
    expect(resolveSubmitCode(ENTRIES, '巨鎧')).toBe('2254');
  });

  it('blocks a name that matches nothing, so it never reaches the data source', () => {
    expect(resolveSubmitCode(ENTRIES, '積電')).toBeNull();
    expect(resolveSubmitCode(ENTRIES, '不存在的公司')).toBeNull();
    expect(resolveSubmitCode(ENTRIES, '2330 台積電')).toBeNull();
    expect(resolveSubmitCode(ENTRIES, '')).toBeNull();
    expect(resolveSubmitCode([], '台積電')).toBeNull();
  });
});
