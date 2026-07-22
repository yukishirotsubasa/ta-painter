import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChartApi, ISeriesApi, ISeriesPrimitive, MouseEventParams, Time } from 'lightweight-charts';
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
    timeScale: vi.fn(() => ({
      coordinateToTime: (x: number) => x as unknown as Time,
      timeToCoordinate: (time: Time) => time as unknown as number,
    })),
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

/**
 * `attachPrimitive`/`detachPrimitive` 真的呼叫 primitive 的 `attached()`/`detached()`，
 * 讓 `TrendLinePrimitive.hitTest()` 內部依賴的 `chart`/`series` 欄位在測試中也會被設好
 * （真實 lightweight-charts 庫在 attachPrimitive 時就是這樣呼叫的）。
 */
function createFakeSeries(chart: IChartApi) {
  const series: ISeriesApi<'Candlestick'> & {
    attachPrimitive: ReturnType<typeof vi.fn>;
    detachPrimitive: ReturnType<typeof vi.fn>;
  } = {
    coordinateToPrice: vi.fn((y: number) => 1000 - y),
    priceToCoordinate: vi.fn((price: number) => 1000 - price),
    attachPrimitive: vi.fn((primitive: ISeriesPrimitive<Time>) => {
      primitive.attached?.({ chart, series, requestUpdate: () => {} } as never);
    }),
    detachPrimitive: vi.fn((primitive: ISeriesPrimitive<Time>) => {
      primitive.detached?.();
    }),
  } as unknown as ISeriesApi<'Candlestick'> & { attachPrimitive: ReturnType<typeof vi.fn>; detachPrimitive: ReturnType<typeof vi.fn> };
  return series;
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
    const series = createFakeSeries(chart);
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
    const series = createFakeSeries(chart);
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

describe('DrawingController selection & delete (drawing4)', () => {
  let fakeWindow: ReturnType<typeof createFakeEventTarget>;

  beforeEach(() => {
    fakeWindow = createFakeEventTarget();
    vi.stubGlobal('window', fakeWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 純點擊（無拖曳）：mousedown 後立刻 mouseup，中間不觸發 crosshair move。 */
  function click(container: ReturnType<typeof createFakeContainer>, x: number, y: number) {
    container.dispatch('mousedown', { clientX: x, clientY: y });
    fakeWindow.dispatch('mouseup', {});
  }

  it('clicking a plain point never creates a line (click-to-select stays side-effect free)', () => {
    const { chart } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    controller.setEnabled(true);
    click(container, 200, 200);

    expect(series.attachPrimitive).not.toHaveBeenCalled();
  });

  it('selecting a line and pressing Delete removes only that line', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    controller.setEnabled(true);
    // 第一條線：pixel (10,10) -> (50,60)
    drawOneLine(controller, container, fireCrosshairMove, fakeWindow);
    // 第二條線：pixel (100,10) -> (150,60)
    container.dispatch('mousedown', { clientX: 100, clientY: 10 });
    fireCrosshairMove({ point: { x: 150, y: 60 }, time: 150 as unknown as Time, paneIndex: 0 } as MouseEventParams<Time>);
    fakeWindow.dispatch('mouseup', {});

    expect(series.attachPrimitive).toHaveBeenCalledTimes(2);

    // 點在第一條線中點 (30,35) 上，命中並選取第一條線。
    click(container, 30, 35);
    fakeWindow.dispatch('keydown', { key: 'Delete', preventDefault: vi.fn() });

    expect(series.detachPrimitive).toHaveBeenCalledTimes(1);
    expect(series.detachPrimitive).toHaveBeenCalledWith(series.attachPrimitive.mock.calls[0][0]);
  });

  it('clicking empty space clears the current selection so Delete does nothing', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    controller.setEnabled(true);
    drawOneLine(controller, container, fireCrosshairMove, fakeWindow);

    click(container, 30, 35); // 選取
    click(container, 700, 500); // 點空白處，清除選取

    fakeWindow.dispatch('keydown', { key: 'Delete', preventDefault: vi.fn() });

    expect(series.detachPrimitive).not.toHaveBeenCalled();
  });

  it('drawing a new line while another line is selected leaves the selected line alone', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    controller.setEnabled(true);
    drawOneLine(controller, container, fireCrosshairMove, fakeWindow);
    click(container, 30, 35); // 選取第一條線

    // 在別處拖出第二條線，不應影響第一條線的選取或內容。
    container.dispatch('mousedown', { clientX: 200, clientY: 10 });
    fireCrosshairMove({ point: { x: 250, y: 60 }, time: 250 as unknown as Time, paneIndex: 0 } as MouseEventParams<Time>);
    fakeWindow.dispatch('mouseup', {});

    expect(series.attachPrimitive).toHaveBeenCalledTimes(2);
    expect(series.detachPrimitive).not.toHaveBeenCalled();

    fakeWindow.dispatch('keydown', { key: 'Delete', preventDefault: vi.fn() });
    expect(series.detachPrimitive).toHaveBeenCalledTimes(1);
    expect(series.detachPrimitive).toHaveBeenCalledWith(series.attachPrimitive.mock.calls[0][0]);
  });
});
