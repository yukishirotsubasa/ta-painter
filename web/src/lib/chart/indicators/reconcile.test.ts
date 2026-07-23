import { beforeEach, describe, expect, it } from 'vitest';
import type { IChartApi } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { reconcileIndicators, type MountedIndicator } from './reconcile';
import { clearIndicators, registerIndicator } from './registry';
import type {
  IndicatorDefinition,
  IndicatorInstance,
  IndicatorParamValues,
  PaneIndexAllocator,
} from './types';

function bars(closes: number[]): OhlcvBar[] {
  return closes.map((close, i) => ({
    time: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
}

interface Calls {
  mount: Array<{ definitionId: string; params: IndicatorParamValues }>;
  update: Array<{ definitionId: string; bars: OhlcvBar[]; params: IndicatorParamValues }>;
  dispose: string[];
}

/** 只記錄呼叫次數的假指標定義，用來驗證哪些實例真的被重新計算。 */
function registerSpyIndicator(definitionId: string, calls: Calls): void {
  const definition: IndicatorDefinition<null> = {
    id: definitionId,
    urlCode: definitionId,
    label: definitionId,
    placement: 'overlay',
    paramsSchema: [],
    compute: () => null,
    mount: (_chart, _allocator, _bars, params) => {
      calls.mount.push({ definitionId, params });
      return {
        update: (nextBars, nextParams) => {
          calls.update.push({ definitionId, bars: nextBars, params: nextParams });
        },
        dispose: () => {
          calls.dispose.push(definitionId);
        },
      };
    },
  };
  registerIndicator(definition);
}

const chart = {} as IChartApi;
const paneIndexAllocator: PaneIndexAllocator = { allocate: () => 2, release: () => {} };

function instance(id: string, definitionId: string, params: IndicatorParamValues): IndicatorInstance {
  return { id, definitionId, params };
}

describe('reconcileIndicators', () => {
  let calls: Calls;
  let mounted: Map<string, MountedIndicator>;

  beforeEach(() => {
    clearIndicators();
    calls = { mount: [], update: [], dispose: [] };
    mounted = new Map();
    registerSpyIndicator('alpha', calls);
    registerSpyIndicator('beta', calls);
  });

  function reconcile(data: OhlcvBar[], instances: IndicatorInstance[]): void {
    reconcileIndicators({ chart, paneIndexAllocator, data, instances, mounted });
  }

  it('mounts new instances and disposes removed ones', () => {
    const data = bars([1, 2, 3]);

    reconcile(data, [instance('a', 'alpha', { period: 5 })]);
    expect(calls.mount.map((call) => call.definitionId)).toEqual(['alpha']);

    reconcile(data, [instance('b', 'beta', { period: 5 })]);
    expect(calls.dispose).toEqual(['alpha']);
    expect(calls.mount.map((call) => call.definitionId)).toEqual(['alpha', 'beta']);
    expect(mounted.has('a')).toBe(false);
  });

  it('skips update() when neither data nor params changed', () => {
    const data = bars([1, 2, 3]);
    const instances = [instance('a', 'alpha', { period: 5 })];

    reconcile(data, instances);
    // 相同 params 但換成新物件（每次 render 的 props 都是新陣列/物件）。
    reconcile(data, [instance('a', 'alpha', { period: 5 })]);

    expect(calls.update).toHaveLength(0);
  });

  it('updates only the instance whose params changed', () => {
    const data = bars([1, 2, 3]);

    reconcile(data, [instance('a', 'alpha', { period: 5 }), instance('b', 'beta', { period: 10 })]);
    reconcile(data, [instance('a', 'alpha', { period: 20 }), instance('b', 'beta', { period: 10 })]);

    expect(calls.update).toHaveLength(1);
    expect(calls.update[0].definitionId).toBe('alpha');
    expect(calls.update[0].params).toEqual({ period: 20 });
  });

  it('updates every instance when the data reference changes', () => {
    reconcile(bars([1, 2, 3]), [
      instance('a', 'alpha', { period: 5 }),
      instance('b', 'beta', { period: 10 }),
    ]);

    const nextData = bars([1, 2, 3, 4]);
    reconcile(nextData, [instance('a', 'alpha', { period: 5 }), instance('b', 'beta', { period: 10 })]);

    expect(calls.update.map((call) => call.definitionId)).toEqual(['alpha', 'beta']);
    expect(calls.update.every((call) => call.bars === nextData)).toBe(true);
  });

  it('detects added and removed param keys as a change', () => {
    const data = bars([1, 2, 3]);

    reconcile(data, [instance('a', 'alpha', { period: 5 })]);
    reconcile(data, [instance('a', 'alpha', { period: 5, color: '#fff' })]);
    expect(calls.update).toHaveLength(1);

    reconcile(data, [instance('a', 'alpha', { period: 5 })]);
    expect(calls.update).toHaveLength(2);
  });

  it('ignores instances whose definition is not registered', () => {
    reconcile(bars([1, 2, 3]), [instance('x', 'unknown', {})]);

    expect(calls.mount).toHaveLength(0);
    expect(mounted.size).toBe(0);
  });
});
