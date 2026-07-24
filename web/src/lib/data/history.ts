import type { OhlcvBar } from './types';

/**
 * 往前動態載入用的純函式：日期位移與 bars 合併（見 `docs/data-layer.md` 的「往前動態載入」）。
 *
 * 抽成純函式而非埋在 `App.tsx` 的 effect 裡，是為了讓「往前推 N 個月」與「合併去重」這兩段
 * 唯一容易出錯的邏輯能被單元測試涵蓋（見 technical-debt「沒有元件測試環境」的因應方式）。
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIso(iso: string): [number, number, number] {
  const [year, month, day] = iso.split('-').map(Number);
  return [year, month, day];
}

/**
 * 'YYYY-MM-DD' 位移 N 個月（負數往前）。日期超出目標月天數時**夾到該月最後一天**，
 * 避免 JS Date 的月份溢位（3/31 往前一個月會變成 3/3）讓區間比預期短。
 */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = parseIso(iso);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return toIso(target);
}

/** 'YYYY-MM-DD' 的前一天（往前載入時作為新區間的結束日，與既有資料不重疊）。 */
export function previousDay(iso: string): string {
  const [year, month, day] = parseIso(iso);
  return toIso(new Date(year, month - 1, day - 1));
}

/**
 * 把往前補到的 `older` 併進既有 `existing`，依時間升冪且同一天只留一筆。
 * 重疊處以 `existing` 為準（同一天的資料兩邊相同，取既有的可避免已顯示的 bar 物件無謂替換）。
 */
export function mergeOlderBars(older: readonly OhlcvBar[], existing: readonly OhlcvBar[]): OhlcvBar[] {
  const byTime = new Map<string, OhlcvBar>();
  for (const bar of older) byTime.set(bar.time, bar);
  for (const bar of existing) byTime.set(bar.time, bar);
  return Array.from(byTime.values()).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}
