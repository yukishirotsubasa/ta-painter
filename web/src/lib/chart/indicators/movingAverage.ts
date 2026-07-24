/**
 * 指標共用的滾動視窗計算核心（indicator12）：三種平滑（SMA/EMA/Wilder RMA）與滾動極值。
 *
 * 全部函式的**對齊規則一致**：回傳陣列的第 0 筆對齊 `values[period - 1]`，
 * 長度為 `values.length - period + 1`；`values.length < period` 時回傳空陣列。
 * 這與 MA／布林通道／MACD 既有「資料不足的時間點不輸出（不是輸出 NaN）」的慣例相同，
 * 呼叫端把結果對回 bars 時一律用 `barIndex = period - 1 + i`。
 */

/** 滾動視窗最大值（KD 的最高價視窗、威廉指標共用）。 */
export function rollingMax(values: number[], period: number): number[] {
  if (period < 1 || values.length < period) return [];

  const result: number[] = [];
  for (let i = period - 1; i < values.length; i += 1) {
    result.push(Math.max(...values.slice(i - period + 1, i + 1)));
  }
  return result;
}

/** 滾動視窗最小值（KD 的最低價視窗、威廉指標共用）。 */
export function rollingMin(values: number[], period: number): number[] {
  if (period < 1 || values.length < period) return [];

  const result: number[] = [];
  for (let i = period - 1; i < values.length; i += 1) {
    result.push(Math.min(...values.slice(i - period + 1, i + 1)));
  }
  return result;
}

/** 簡單移動平均（SMA）。 */
export function sma(values: number[], period: number): number[] {
  if (period < 1 || values.length < period) return [];

  const result: number[] = [];
  for (let i = period - 1; i < values.length; i += 1) {
    const window = values.slice(i - period + 1, i + 1);
    result.push(window.reduce((acc, value) => acc + value, 0) / period);
  }
  return result;
}

/** 指數移動平均（EMA），種子為前 period 筆的 SMA，之後 `value * k + prev * (1 - k)`，`k = 2/(period+1)`。 */
export function ema(values: number[], period: number): number[] {
  if (period < 1 || values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const result: number[] = [];

  let previous = values.slice(0, period).reduce((acc, value) => acc + value, 0) / period;
  result.push(previous);

  for (let i = period; i < values.length; i += 1) {
    previous = values[i] * multiplier + previous * (1 - multiplier);
    result.push(previous);
  }

  return result;
}

/**
 * Wilder 平滑（RMA），種子同樣是前 period 筆的 SMA，之後 `prev + (value - prev) / period`
 * （等價於 `k = 1/period` 的 EMA，而非 `2/(period+1)`）。RSI／ATR／DMI 的原始定義都用這一種。
 */
export function wilderRma(values: number[], period: number): number[] {
  if (period < 1 || values.length < period) return [];

  const result: number[] = [];

  let previous = values.slice(0, period).reduce((acc, value) => acc + value, 0) / period;
  result.push(previous);

  for (let i = period; i < values.length; i += 1) {
    previous = previous + (values[i] - previous) / period;
    result.push(previous);
  }

  return result;
}
