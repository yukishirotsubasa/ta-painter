import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChartApi, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts';
import { DrawingController } from './drawingController';

type Listener = (event: unknown) => void;

function createFakeEventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: vi.fn((type: string, cb: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: Listener) => {
      listeners.get(type)?.delete(cb);
    }),
    dispatch(type: string, event: unknown) {
      for (const cb of listeners.get(type) ?? []) cb(event);
    },
  };
}

function createFakeChart() {
  const target = createFakeEventTarget();
  let crosshairCallback: ((param: MouseEventParams<Time>) => void) | null = null;

  const chart = {
    applyOptions: vi.fn(),
    panes: vi.fn(() => [{ getHeight: () => 600 }]),
    timeScale: vi.fn(() => ({ coordinateToTime: (x: number) => x as unknown as Time })),
    subscribeCrosshairMove: vi.fn((cb: (param: MouseEventParams<Time>) => void) => {
      crosshairCallback = cb;
    }),
    unsubscribeCrosshairMove: vi.fn(() => {
      crosshairCallback = null;
    }),
  };

  return {
    chart: chart as unknown as IChartApi,
    fireCrosshairMove: (param: MouseEventParams<Time>) => crosshairCallback?.(param),
    target,
  };
}

function createFakeSeries() {
  return {
    coordinateToPrice: vi.fn((y: number) => 1000 - y),
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
  } as unknown as ISeriesApi<'Candlestick'> & { attachPrimitive: ReturnType<typeof vi.fn>; detachPrimitive: ReturnType<typeof vi.fn> };
}

function createFakeContainer() {
  const target = createFakeEventTarget();
  return {
    ...target,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect,
  } as unknown as HTMLElement & { dispatch: (type: string, event: unknown) => void };
}

function drawOneLine(
  controller: DrawingController,
  container: ReturnType<typeof createFakeContainer>,
  fireCrosshairMove: (param: MouseEventParams<Time>) => void,
  fakeWindow: ReturnType<typeof createFakeEventTarget>,
) {
  container.dispatch('mousedown', { clientX: 10, clientY: 10 });
  fireCrosshairMove({ point: { x: 50, y: 60 }, time: 50 as unknown as Time, paneIndex: 0 } as MouseEventParams<Time>);
  fakeWindow.dispatch('mouseup', {});
}

describe('DrawingController.clearAll', () => {
  let fakeWindow: ReturnType<typeof createFakeEventTarget>;

  beforeEach(() => {
    fakeWindow = createFakeEventTarget();
    vi.stubGlobal('window', fakeWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detaches every finished line and empties the drawn-line list', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries();
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    controller.setEnabled(true);
    drawOneLine(controller, container, fireCrosshairMove, fakeWindow);
    drawOneLine(controller, container, fireCrosshairMove, fakeWindow);

    expect(series.attachPrimitive).toHaveBeenCalledTimes(2);
    expect(series.detachPrimitive).not.toHaveBeenCalled();

    controller.clearAll();

    expect(series.detachPrimitive).toHaveBeenCalledTimes(2);
  });

  it('does not redraw previously cleared lines on a later clearAll call', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries();
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    controller.setEnabled(true);
    drawOneLine(controller, container, fireCrosshairMove, fakeWindow);
    controller.clearAll();
    expect(series.detachPrimitive).toHaveBeenCalledTimes(1);

    controller.clearAll();

    expect(series.detachPrimitive).toHaveBeenCalledTimes(1);
  });
});
