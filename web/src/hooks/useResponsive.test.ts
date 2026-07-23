import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_MEDIA_QUERY, DESKTOP_MIN_WIDTH, readBreakpoint, subscribeBreakpoint } from './useResponsive';

/** 測試環境是 node（無 DOM），`window.matchMedia` 一律用 `vi.stubGlobal` 換成假物件。 */
afterEach(() => {
  vi.unstubAllGlobals();
});

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const queries: string[] = [];

  vi.stubGlobal('window', {
    matchMedia: (query: string) => {
      queries.push(query);
      return {
        matches,
        addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
      };
    },
  });

  return { listeners, queries };
}

describe('readBreakpoint', () => {
  it('media query 命中時為桌面版', () => {
    stubMatchMedia(true);
    expect(readBreakpoint()).toBe('desktop');
  });

  it('media query 未命中時為行動平板版', () => {
    stubMatchMedia(false);
    expect(readBreakpoint()).toBe('mobile');
  });

  it('查詢字串以斷點常數組出', () => {
    const { queries } = stubMatchMedia(true);
    readBreakpoint();
    expect(queries).toEqual([`(min-width: ${DESKTOP_MIN_WIDTH}px)`]);
    expect(DESKTOP_MEDIA_QUERY).toBe('(min-width: 1024px)');
  });

  it('沒有 matchMedia（非瀏覽器環境）時當桌面版，不丟例外', () => {
    vi.stubGlobal('window', {});
    expect(readBreakpoint()).toBe('desktop');
  });
});

describe('subscribeBreakpoint', () => {
  it('訂閱後 change 事件會通知，取消訂閱後移除 listener', () => {
    const { listeners } = stubMatchMedia(true);
    const onChange = vi.fn();

    const unsubscribe = subscribeBreakpoint(onChange);
    expect(listeners.size).toBe(1);

    for (const listener of listeners) listener();
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  it('沒有 matchMedia 時回傳可安全呼叫的空 unsubscribe', () => {
    vi.stubGlobal('window', {});
    expect(() => subscribeBreakpoint(() => {})()).not.toThrow();
  });
});
