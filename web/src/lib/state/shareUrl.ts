import type { Time } from 'lightweight-charts';
import type { DrawnLine } from '../chart/drawing/drawingController';
import type { TrendLinePoint } from '../chart/drawing/trendLinePrimitive';
import type { IndicatorInstance } from '../chart/indicators/types';
import type { ShareIndicator, ShareLine, ShareState, ShareTime } from './schema';
import { SHARE_HASH_KEY, decodeShareState, encodeShareState } from './urlState';

/**
 * URL hash 與 App 狀態之間的橋接（share2）。
 *
 * hash 格式為 `#s=<lz-string 編碼>`。刻意**不用 `URLSearchParams`** 解析：
 * `compressToEncodedURIComponent` 的字母表含 `+`，而 `URLSearchParams` 會把 query 語意的 `+` 當成空白，
 * 解出來的字串會壞掉；這裡直接切字首取原始值。
 */

const HASH_PREFIX = `${SHARE_HASH_KEY}=`;

export type ShareHashResult =
  /** hash 沒有 `s=` 參數（一般的直接開站）。 */
  | { status: 'absent' }
  /** 有 `s=` 但解不出合法狀態（連結被截斷／手改壞）；呼叫端應照常載入預設畫面並提示。 */
  | { status: 'invalid' }
  | { status: 'ok'; state: ShareState };

/** 解析 `location.hash`（可帶或不帶開頭的 `#`）。 */
export function readShareHash(hash: string): ShareHashResult {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.startsWith(HASH_PREFIX)) return { status: 'absent' };

  const state = decodeShareState(raw.slice(HASH_PREFIX.length));
  return state === null ? { status: 'invalid' } : { status: 'ok', state };
}

/** 產生可直接餵給 `history.replaceState` 的 hash 字串（含 `#`）。 */
export function formatShareHash(state: ShareState): string {
  return `#${HASH_PREFIX}${encodeShareState(state)}`;
}

// --- App 狀態 ↔ ShareState ---

/** 分享時丟掉 `IndicatorInstance.id`（uuid 只在本機 session 有意義，還原時重新產生）。 */
export function toShareIndicators(instances: readonly IndicatorInstance[]): ShareIndicator[] {
  return instances.map((instance) => ({ definitionId: instance.definitionId, params: { ...instance.params } }));
}

export function toIndicatorInstances(
  indicators: readonly ShareIndicator[],
  createId: () => string = () => crypto.randomUUID(),
): IndicatorInstance[] {
  return indicators.map((indicator) => ({
    id: createId(),
    definitionId: indicator.definitionId,
    params: { ...indicator.params },
  }));
}

/**
 * lightweight-charts 的 `Time` 轉可編碼的時間；`BusinessDay` 物件形式無法編碼（本專案不會產生，
 * 資料 time 一律是 'YYYY-MM-DD' 字串），回傳 `null` 讓呼叫端捨棄該線而非讓整條連結失效。
 */
export function toShareTime(time: Time): ShareTime | null {
  if (typeof time === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(time) ? time : null;
  if (typeof time === 'number') return Number.isInteger(time) ? time : null;
  return null;
}

export function toChartTime(time: ShareTime): Time {
  return time as Time;
}

/** 尚未定案（`points === null`）或時間格式無法編碼的線一律略過，其餘照常分享。 */
export function toShareLines(lines: readonly DrawnLine[]): ShareLine[] {
  const shareLines: ShareLine[] = [];
  for (const line of lines) {
    if (!line.points) continue;
    const from = toShareTime(line.points[0].time);
    const to = toShareTime(line.points[1].time);
    if (from === null || to === null) continue;
    shareLines.push({
      points: [
        { time: from, price: line.points[0].price },
        { time: to, price: line.points[1].price },
      ],
      color: line.color,
      width: line.width,
    });
  }
  return shareLines;
}

/** `ShareLine` → `DrawingController.addLine()` 的參數。 */
export function toTrendLinePoints(line: ShareLine): readonly [TrendLinePoint, TrendLinePoint] {
  return [
    { time: toChartTime(line.points[0].time), price: line.points[0].price },
    { time: toChartTime(line.points[1].time), price: line.points[1].price },
  ];
}
