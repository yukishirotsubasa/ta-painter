import type { IChartApi } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import { getIndicator } from './registry';
import type {
  IndicatorInstance,
  IndicatorMountHandle,
  IndicatorParamValues,
  PaneIndexAllocator,
} from './types';

/** 已掛載的指標；連同上次套用的 `params`／`data` 參考一起記，供變更偵測用（indicator11）。 */
export interface MountedIndicator {
  handle: IndicatorMountHandle;
  appliedParams: IndicatorParamValues;
  appliedData: OhlcvBar[];
}

export interface ReconcileIndicatorsOptions {
  chart: IChartApi;
  paneIndexAllocator: PaneIndexAllocator;
  data: OhlcvBar[];
  instances: readonly IndicatorInstance[];
  /** 目前已掛載的指標，會被就地增刪改。 */
  mounted: Map<string, MountedIndicator>;
}

/** `params` 為扁平的 `Record<string, number | string>`（indicator6 起），淺層比較即足夠。 */
function paramsEqual(a: IndicatorParamValues, b: IndicatorParamValues): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
}

/**
 * 把 `instances` 的內容同步到圖表：移除已不存在的、掛載新增的、更新有變動的。
 *
 * 只有 `data` 參考變動或該實例的 `params` 淺層 diff 有異時才呼叫 `update()`，
 * 避免調整單一指標參數時連帶重算並重繪其他未變動的指標（indicator11）。
 */
export function reconcileIndicators({
  chart,
  paneIndexAllocator,
  data,
  instances,
  mounted,
}: ReconcileIndicatorsOptions): void {
  const currentIds = new Set(instances.map((instance) => instance.id));

  for (const [id, entry] of mounted) {
    if (!currentIds.has(id)) {
      entry.handle.dispose();
      mounted.delete(id);
    }
  }

  for (const instance of instances) {
    const definition = getIndicator(instance.definitionId);
    if (!definition) continue;

    const existing = mounted.get(instance.id);
    if (!existing) {
      mounted.set(instance.id, {
        handle: definition.mount(chart, paneIndexAllocator, data, instance.params),
        appliedParams: instance.params,
        appliedData: data,
      });
      continue;
    }

    if (existing.appliedData === data && paramsEqual(existing.appliedParams, instance.params)) {
      continue;
    }

    existing.handle.update(data, instance.params);
    existing.appliedParams = instance.params;
    existing.appliedData = data;
  }
}
