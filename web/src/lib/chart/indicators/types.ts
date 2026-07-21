import type { IChartApi } from 'lightweight-charts';
import type { OhlcvBar } from '../../data/types';

/** 目前僅支援數值型參數（週期、標準差倍數等），UI 依此動態產生數字輸入欄位。 */
export interface IndicatorParamSchema {
  key: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

export type IndicatorParamValues = Record<string, number>;

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
