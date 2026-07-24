import type { OhlcvBar } from './types';

/**
 * 還原權值換算（「使用還原價」開關用）。純函式，供單元測試與 App 層 `useMemo` 衍生。
 *
 * 還原因子 `factor = adjClose / close`（Yahoo 的 adjclose 已對除權息／分割還原，且各批以最新為基準，
 * 往前動態載入併入更舊資料仍同基準，見 `docs/data-layer.md`）。把 factor 乘回 OHL、close 直接用 adjClose，
 * 即得整組還原 OHLC。
 *
 * **成交量不還原**：Yahoo adjclose 混合配息與分割，其 factor 對量能無正確物理意義（配息不影響成交量），
 * 台股分割罕見，故 volume 維持原始值。
 */

/** 相鄰還原因子的相對變化超過此門檻即視為除權息／分割日（濾除浮點雜訊）。 */
const FACTOR_STEP_THRESHOLD = 1e-4;

/** 取還原因子；無 `adjClose` 或 `close` 為 0（無從相除）時回傳 `null`（該 bar 不參與還原）。 */
function factorOf(bar: OhlcvBar): number | null {
  if (bar.adjClose === undefined || bar.close === 0) return null;
  return bar.adjClose / bar.close;
}

/**
 * 回傳整組還原後的 bars。有還原因子的 bar 其 OHL 乘上 factor、close 取 adjClose；
 * 無因子（官方源、或該日 adjClose 缺值）的 bar 原樣保留。volume/time/adjClose 不變。
 */
export function toAdjustedBars(bars: OhlcvBar[]): OhlcvBar[] {
  return bars.map((bar) => {
    const factor = factorOf(bar);
    if (factor === null) return bar;
    return {
      ...bar,
      open: bar.open * factor,
      high: bar.high * factor,
      low: bar.low * factor,
      close: bar.adjClose as number,
    };
  });
}

/**
 * 找出價格變動（除權息／分割）日：相鄰兩根有因子的 bar，其 factor 相對變化超過門檻，
 * 則後一根（除權息當日、價格實際跳空的那天）視為變動日，回傳其 `time`。
 * 無 adjClose 的 bar 不更新比較基準（略過缺值，不誤判為變動）。
 */
export function detectAdjustmentDates(bars: OhlcvBar[]): string[] {
  const dates: string[] = [];
  let prevFactor: number | null = null;

  for (const bar of bars) {
    const factor = factorOf(bar);
    if (factor === null) continue;
    if (prevFactor !== null && Math.abs(factor - prevFactor) > prevFactor * FACTOR_STEP_THRESHOLD) {
      dates.push(bar.time);
    }
    prevFactor = factor;
  }

  return dates;
}
