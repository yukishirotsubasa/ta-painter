import { beforeEach, describe, expect, it } from 'vitest';
import type { OhlcvBar, StockDataProvider } from '../types';
import { clearProviders, getProvider, listProviders, registerProvider } from './providerRegistry';

function createMockProvider(id: string): StockDataProvider {
  return {
    id,
    label: `Mock Provider ${id}`,
    async fetchDaily(): Promise<OhlcvBar[]> {
      return [{ time: '2026-07-21', open: 100, high: 101, low: 99, close: 100.5, volume: 1000 }];
    },
  };
}

describe('providerRegistry', () => {
  beforeEach(() => {
    clearProviders();
  });

  it('registers and retrieves a provider by id', () => {
    const mock = createMockProvider('mock');
    registerProvider(mock);

    const found = getProvider('mock');

    expect(found).toBe(mock);
  });

  it('returns undefined for an unregistered id', () => {
    expect(getProvider('missing')).toBeUndefined();
  });

  it('lists all registered providers', () => {
    registerProvider(createMockProvider('a'));
    registerProvider(createMockProvider('b'));

    expect(listProviders().map((p) => p.id).sort()).toEqual(['a', 'b']);
  });
});
