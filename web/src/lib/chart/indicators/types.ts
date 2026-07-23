import type { IChartApi } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';

/** enum 參數的單一可選項（value 存進 params，label 顯示於 UI）。 */
export interface IndicatorParamOption {
  value: string;
  label: string;
}

interface BaseParamSchema {
  key: string;
  label: string;
}

/** 數值型參數（週期、標準差倍數等）；`type` 省略時視為 'number'，維持既有指標寫法相容。 */
export interface NumberParamSchema extends BaseParamSchema {
  type?: 'number';
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

/** 列舉型參數，UI 以 select 呈現；值為 options 之一的 value（string）。 */
export interface EnumParamSchema extends BaseParamSchema {
  type: 'enum';
  default: string;
  options: IndicatorParamOption[];
}

/** 顏色型參數，UI 以 color picker 呈現；值為 `#rrggbb` 字串。 */
export interface ColorParamSchema extends BaseParamSchema {
  type: 'color';
  default: string;
}

/**
 * 指標參數 schema：以 `type` 區分渲染方式（number/enum/color）。
 * `type` 省略等同 'number'，故既有純數值指標定義無需改動。
 */
export type IndicatorParamSchema = NumberParamSchema | EnumParamSchema | ColorParamSchema;

/** 參數值：number（數值型）或 string（enum/color）。 */
export type IndicatorParamValues = Record<string, number | string>;

/** 讀取數值型參數並回退預設值，容忍以 string 儲存的數字（分享還原等情境）。 */
export function numberParam(params: IndicatorParamValues, key: string, fallback: number): number {
  const raw = params[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isNaN(value) ? fallback : value;
}

/** 讀取字串型參數（enum/color）並回退預設值。 */
export function stringParam(params: IndicatorParamValues, key: string, fallback: string): string {
  const raw = params[key];
  return typeof raw === 'string' && raw !== '' ? raw : fallback;
}

/** 使用者已加入的一個指標實例（同一 definition 可有多個實例，如 MA5 + MA20）。 */
export interface IndicatorInstance {
  id: string;
  definitionId: string;
  params: IndicatorParamValues;
}

/**
 * separate-pane 指標動態配置/歸還 pane index（pane 0/1 已被主圖 K 線與量能佔用）。
 * 由掛載指標的呼叫端（chart container）提供實作。
 */
export interface PaneIndexAllocator {
  allocate(): number;
  release(paneIndex: number): void;
}

/** `mount()` 回傳的控制把手，供參數變動時更新數值、或移除指標時釋放 series/pane。 */
export interface IndicatorMountHandle {
  update(bars: OhlcvBar[], params: IndicatorParamValues): void;
  dispose(): void;
}

/**
 * 指標定義：`compute()` 為純函式只算數值（相同輸入必回傳相同輸出，不得有副作用），
 * `mount()` 負責把計算結果掛到 chart 的 series/pane（副作用），兩者職責分離。
 */
export interface IndicatorDefinition<TValue = unknown> {
  readonly id: string;
  /**
   * URL 分享用的穩定短代碼（share1），與 `id` 分離：`id` 可隨重構更名，`urlCode` 一旦發布就不得更動，
   * 否則既有分享連結會解不出該指標。全域唯一，僅使用 `[a-z0-9]`（不含編碼用的分隔字元）。
   */
  readonly urlCode: string;
  readonly label: string;
  readonly placement: 'overlay' | 'separate-pane';
  readonly paramsSchema: IndicatorParamSchema[];
  compute(bars: OhlcvBar[], params: IndicatorParamValues): TValue;
  mount(
    chart: IChartApi,
    paneIndexAllocator: PaneIndexAllocator,
    bars: OhlcvBar[],
    params: IndicatorParamValues,
  ): IndicatorMountHandle;
}
