import { useSyncExternalStore } from 'react';

/** 桌面／行動平板的分界（與 index.css 既有的 `max-width: 1024px` 字級調整同一條線）。 */
export const DESKTOP_MIN_WIDTH = 1024;

export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

export type Breakpoint = 'desktop' | 'mobile';

function mediaQueryList(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(DESKTOP_MEDIA_QUERY);
}

/** 目前斷點；`matchMedia` 不存在（非瀏覽器環境）時一律當桌面版。 */
export function readBreakpoint(): Breakpoint {
  const mql = mediaQueryList();
  if (!mql) return 'desktop';
  return mql.matches ? 'desktop' : 'mobile';
}

export function subscribeBreakpoint(onChange: () => void): () => void {
  const mql = mediaQueryList();
  if (!mql) return () => {};

  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * 目前斷點，跨越 1024px 時重新 render。
 * 回傳字串而非物件：`useSyncExternalStore` 要求 snapshot 在未變動時參考相等。
 */
export function useResponsive(): Breakpoint {
  return useSyncExternalStore(subscribeBreakpoint, readBreakpoint);
}
