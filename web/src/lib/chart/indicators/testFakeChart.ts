import type { IChartApi } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';
import type { PaneIndexAllocator } from './types';

/**
 * **僅供單元測試使用**的 fake chart（indicator12）。
 *
 * 本專案沒有 jsdom 測試環境，指標的 `mount()` 契約（掛幾條 series、掛在哪個 pane、
 * 色值有沒有在 mount/update 套用、dispose 有沒有把 series 移乾淨）一律靠這個 fake 驗證。
 * 沒有任何正式程式碼 import 它，因此不會進 bundle。
 *
 * 涵蓋的 API 面：`addSeries` / `removeSeries` / `panes`（chart）、
 * `setData` / `applyOptions` / `getPane` / `moveToPane` / `createPriceLine` / `removePriceLine` /
 * `attachPrimitive` / `detachPrimitive`（series，後兩者讓 `createSeriesMarkers()` 能真的跑起來）。
 */

export interface FakeSeriesRecord {
  /** `chart.addSeries()` 傳入的 series 建構子（LineSeries / HistogramSeries…）。 */
  seriesType: unknown;
  addOptions: Record<string, unknown>;
  /** `addSeries()` 指定的 pane index；`moveToPane()` 會就地更新。 */
  paneIndex: number;
  applied: Array<Record<string, unknown>>;
  lastData: unknown;
  /** `createPriceLine()` 目前尚存的參考線選項（`removePriceLine()` 會移除）。 */
  priceLines: Array<Record<string, unknown>>;
  /** 透過 `attachPrimitive()` 掛上的 primitive（series markers 走這條）。 */
  primitives: unknown[];
  removed: boolean;
}

export interface FakeChart {
  /** 轉型後直接餵給 `definition.mount()`。 */
  chart: IChartApi;
  allocator: PaneIndexAllocator;
  /** 依 `addSeries()` 呼叫順序記錄。 */
  series: FakeSeriesRecord[];
  allocateCount: () => number;
  releasedPanes: number[];
}

/** `startPane` 是 allocator 配給第一個 separate-pane 指標的 index（正式環境為 `RESERVED_PANE_COUNT` = 2）。 */
export function createFakeChart(startPane = 2): FakeChart {
  const series: FakeSeriesRecord[] = [];
  const releasedPanes: number[] = [];
  /** series api 物件 → record，讓 `removeSeries()` 能以身分精確對上。 */
  const apiToRecord = new WeakMap<object, FakeSeriesRecord>();
  let allocateCount = 0;

  const chart = {
    addSeries: (seriesType: unknown, options: Record<string, unknown> = {}, pane = 0) => {
      const record: FakeSeriesRecord = {
        seriesType,
        addOptions: options,
        paneIndex: pane,
        applied: [],
        lastData: undefined,
        priceLines: [],
        primitives: [],
        removed: false,
      };
      series.push(record);

      const api = {
        setData: (data: unknown) => {
          record.lastData = data;
        },
        applyOptions: (opts: Record<string, unknown>) => record.applied.push(opts),
        getPane: () => ({ paneIndex: () => record.paneIndex }),
        moveToPane: (target: number) => {
          record.paneIndex = target;
        },
        createPriceLine: (options: Record<string, unknown>) => {
          record.priceLines.push(options);
          return options;
        },
        removePriceLine: (line: Record<string, unknown>) => {
          const index = record.priceLines.indexOf(line);
          if (index >= 0) record.priceLines.splice(index, 1);
        },
        attachPrimitive: (primitive: unknown) => record.primitives.push(primitive),
        detachPrimitive: (primitive: unknown) => {
          const index = record.primitives.indexOf(primitive);
          if (index >= 0) record.primitives.splice(index, 1);
        },
      };

      apiToRecord.set(api, record);
      return api;
    },
    removeSeries: (target: object) => {
      const record = apiToRecord.get(target);
      if (record) record.removed = true;
    },
    panes: () => Array.from({ length: startPane + allocateCount }, (_, i) => i),
  };

  return {
    chart: chart as unknown as IChartApi,
    allocator: {
      allocate: () => {
        const index = startPane + allocateCount;
        allocateCount += 1;
        return index;
      },
      release: (paneIndex: number) => {
        releasedPanes.push(paneIndex);
      },
    },
    series,
    allocateCount: () => allocateCount,
    releasedPanes,
  };
}

/** 只指定收盤價的測試 bar（OHLC 全等於 close）。 */
export function closeBar(time: string, close: number): OhlcvBar {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

/** 以 `2024-01-01` 起算的連續日期，把收盤價陣列展成 bars。 */
export function closeBars(closes: number[]): OhlcvBar[] {
  return closes.map((close, i) => closeBar(isoDay(i), close));
}

/** 第 index 天（0-based）的 `YYYY-MM-DD`，自 2024-01-01 起算。 */
export function isoDay(index: number): string {
  const date = new Date(Date.UTC(2024, 0, 1 + index));
  return date.toISOString().slice(0, 10);
}
