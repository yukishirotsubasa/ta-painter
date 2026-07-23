import { describe, expect, it } from 'vitest';
import { mergeStockLists, serializeStockList } from './stockList.ts';

const TSMC = { code: '2330', name: '台積電', market: 'TWSE' } as const;
const GWC = { code: '6488', name: '環球晶', market: 'TPEX' } as const;
const DUPLICATE_TSMC = { code: '2330', name: '台積電（上櫃）', market: 'TPEX' } as const;

describe('mergeStockLists', () => {
  it('dedupes by code with first-wins, so TWSE beats TPEX', () => {
    expect(mergeStockLists([TSMC], [DUPLICATE_TSMC, GWC])).toEqual([TSMC, GWC]);
  });

  it('keeps the original source order', () => {
    const codes = mergeStockLists([TSMC], [GWC]).map((entry) => entry.code);

    expect(codes).toEqual(['2330', '6488']);
  });
});

describe('serializeStockList', () => {
  it('emits valid JSON with one entry per line and a trailing newline', () => {
    const json = serializeStockList([TSMC, GWC]);

    expect(json).toBe(
      '[\n{"code":"2330","name":"台積電","market":"TWSE"},\n{"code":"6488","name":"環球晶","market":"TPEX"}\n]\n',
    );
    expect(JSON.parse(json)).toEqual([TSMC, GWC]);
  });
});
