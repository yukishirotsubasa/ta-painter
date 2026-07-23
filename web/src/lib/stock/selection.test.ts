import { describe, expect, it } from 'vitest';
import { applySubmittedCode } from './selection';
import type { SymbolSelection } from './types';

describe('applySubmittedCode', () => {
  it('keeps the same object when the code did not change (no refetch)', () => {
    const prev: SymbolSelection = { code: '2330', market: 'TWSE' };

    expect(applySubmittedCode(prev, '2330')).toBe(prev);
  });

  it('keeps the same object even when the market is still unresolved', () => {
    const prev: SymbolSelection = { code: '9999', market: null };

    expect(applySubmittedCode(prev, '9999')).toBe(prev);
  });

  it('resets the market for a new code so the stock list resolves it again', () => {
    const prev: SymbolSelection = { code: '2330', market: 'TWSE' };

    expect(applySubmittedCode(prev, '6488')).toEqual({ code: '6488', market: null });
  });

  it('treats a different letter case as a new code (the stock list normalises it afterwards)', () => {
    const prev: SymbolSelection = { code: '00631L', market: 'TWSE' };

    expect(applySubmittedCode(prev, '00631l')).toEqual({ code: '00631l', market: null });
  });
});
