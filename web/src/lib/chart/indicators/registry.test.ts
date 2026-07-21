import { beforeEach, describe, expect, it } from 'vitest';
import type { IndicatorDefinition } from './types';
import { clearIndicators, getIndicator, listIndicators, registerIndicator } from './registry';

function createMockIndicator(id: string): IndicatorDefinition<number> {
  return {
    id,
    label: `Mock Indicator ${id}`,
    placement: 'overlay',
    paramsSchema: [],
    compute: () => 0,
    mount: () => ({ update: () => {}, dispose: () => {} }),
  };
}

describe('indicator registry', () => {
  beforeEach(() => {
    clearIndicators();
  });

  it('registers and retrieves an indicator by id', () => {
    const mock = createMockIndicator('mock');
    registerIndicator(mock);

    expect(getIndicator('mock')).toBe(mock);
  });

  it('returns undefined for an unregistered id', () => {
    expect(getIndicator('missing')).toBeUndefined();
  });

  it('lists all registered indicators', () => {
    registerIndicator(createMockIndicator('a'));
    registerIndicator(createMockIndicator('b'));

    expect(listIndicators().map((def) => def.id).sort()).toEqual(['a', 'b']);
  });
});
