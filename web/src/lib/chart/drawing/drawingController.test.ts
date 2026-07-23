import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChartApi, ISeriesApi, ISeriesPrimitive, MouseEventParams, Time } from 'lightweight-charts';
import { DrawingController } from './drawingController';
import { DEFAULT_DRAWING_LINE_COLOR } from '../colors';
import { DEFAULT_TREND_LINE_WIDTH } from './trendLinePrimitive';

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
    drawOneLine(container, fireCrosshairMove, fakeWindow);
    drawOneLine(container, fireCrosshairMove, fakeWindow);

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
    drawOneLine(container, fireCrosshairMove, fakeWindow);
    controller.clearAll();
    expect(series.detachPrimitive).toHaveBeenCalledTimes(1);

    controller.clearAll();

    expect(series.detachPrimitive).toHaveBeenCalledTimes(1);
  });
});

describe('DrawingController line list API (drawing6)', () => {
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

  /** 第二條線：pixel (100,10) -> (150,60)，與 drawOneLine 的第一條線區隔。 */
  function drawSecondLine(
    container: ReturnType<typeof createFakeContainer>,
    fireCrosshairMove: (param: MouseEventParams<Time>) => void,
  ) {
    container.dispatch('mousedown', { clientX: 100, clientY: 10 });
    fireCrosshairMove({ point: { x: 150, y: 60 }, time: 150 as unknown as Time, paneIndex: 0 } as MouseEventParams<Time>);
    fakeWindow.dispatch('mouseup', {});
  }

  it('getLines() exposes id + logical points for each finished line', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    controller.setEnabled(true);
    expect(controller.getLines()).toEqual([]);

    // pixel (10,10) -> (50,60)：起點 coordinateToTime(10)=10 / coordinateToPrice(10)=990，終點 time 50 / coordinateToPrice(60)=940。
    drawOneLine(container, fireCrosshairMove, fakeWindow);

    const lines = controller.getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe('line-1');
    expect(lines[0].points).toEqual([
      { time: 10, price: 990 },
      { time: 50, price: 940 },
    ]);
  });

  it('onLinesChange fires with the current line list after each draw', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    const listener = vi.fn();
    controller.setEnabled(true);
    controller.onLinesChange(listener);

    drawOneLine(container, fireCrosshairMove, fakeWindow);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toHaveLength(1);

    drawSecondLine(container, fireCrosshairMove);
    expect(listener).toHaveBeenCalledTimes(2);
    const secondSnapshot = listener.mock.calls[1][0];
    expect(secondSnapshot.map((l: { id: string }) => l.id)).toEqual(['line-1', 'line-2']);
  });

  it('deleteLine(id) removes only that line, detaches its primitive, and notifies', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    const listener = vi.fn();
    controller.setEnabled(true);
    drawOneLine(container, fireCrosshairMove, fakeWindow);
    drawSecondLine(container, fireCrosshairMove);
    controller.onLinesChange(listener);

    controller.deleteLine('line-1');

    expect(series.detachPrimitive).toHaveBeenCalledTimes(1);
    expect(series.detachPrimitive).toHaveBeenCalledWith(series.attachPrimitive.mock.calls[0][0]);
    expect(controller.getLines().map((l) => l.id)).toEqual(['line-2']);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].map((l: { id: string }) => l.id)).toEqual(['line-2']);
  });

  it('deleteLine(id) with an unknown id is a no-op (no detach, no notify)', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    const listener = vi.fn();
    controller.setEnabled(true);
    drawOneLine(container, fireCrosshairMove, fakeWindow);
    controller.onLinesChange(listener);

    controller.deleteLine('does-not-exist');

    expect(series.detachPrimitive).not.toHaveBeenCalled();
    expect(controller.getLines()).toHaveLength(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('clearAll() empties the list and notifies onLinesChange with an empty snapshot', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    const listener = vi.fn();
    controller.setEnabled(true);
    drawOneLine(container, fireCrosshairMove, fakeWindow);
    drawSecondLine(container, fireCrosshairMove);
    controller.onLinesChange(listener);

    controller.clearAll();

    expect(controller.getLines()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual([]);
  });

  it('a plain click (no drag) creates no line and does not notify (canvas click-select removed)', () => {
    const { chart } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    const listener = vi.fn();
    controller.setEnabled(true);
    controller.onLinesChange(listener);

    click(container, 200, 200);

    expect(series.attachPrimitive).not.toHaveBeenCalled();
    expect(controller.getLines()).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('onLinesChange returns an unsubscribe that stops further notifications', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    const listener = vi.fn();
    controller.setEnabled(true);
    const unsubscribe = controller.onLinesChange(listener);

    drawOneLine(container, fireCrosshairMove, fakeWindow);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    drawSecondLine(container, fireCrosshairMove);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('highlightLine(id) marks the primitive selected and clears it on null / delete', () => {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });

    controller.setEnabled(true);
    drawOneLine(container, fireCrosshairMove, fakeWindow);
    const primitive = series.attachPrimitive.mock.calls[0][0] as { selected: boolean };

    controller.highlightLine('line-1');
    expect(primitive.selected).toBe(true);

    controller.highlightLine(null);
    expect(primitive.selected).toBe(false);

    // 高亮中的線被刪除後，內部高亮狀態重置，不應影響其後的高亮呼叫。
    controller.highlightLine('line-1');
    controller.deleteLine('line-1');
    expect(() => controller.highlightLine(null)).not.toThrow();
  });
});

describe('DrawingController color API (drawing7)', () => {
  let fakeWindow: ReturnType<typeof createFakeEventTarget>;

  beforeEach(() => {
    fakeWindow = createFakeEventTarget();
    vi.stubGlobal('window', fakeWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function drawSecondLine(
    container: ReturnType<typeof createFakeContainer>,
    fireCrosshairMove: (param: MouseEventParams<Time>) => void,
  ) {
    container.dispatch('mousedown', { clientX: 100, clientY: 10 });
    fireCrosshairMove({ point: { x: 150, y: 60 }, time: 150 as unknown as Time, paneIndex: 0 } as MouseEventParams<Time>);
    fakeWindow.dispatch('mouseup', {});
  }

  function setup() {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });
    controller.setEnabled(true);
    return { controller, container, series, fireCrosshairMove };
  }

  it('new lines use the current drawing color; each line keeps its own', () => {
    const { controller, container, fireCrosshairMove } = setup();

    expect(controller.getDrawingColor()).toBe(DEFAULT_DRAWING_LINE_COLOR);
    drawOneLine(container, fireCrosshairMove, fakeWindow);

    controller.setDrawingColor('#ff0000');
    drawSecondLine(container, fireCrosshairMove);

    expect(controller.getLines().map((line) => line.color)).toEqual([DEFAULT_DRAWING_LINE_COLOR, '#ff0000']);
  });

  it('setDrawingColor() does not repaint lines that were already drawn', () => {
    const { controller, container, fireCrosshairMove } = setup();

    drawOneLine(container, fireCrosshairMove, fakeWindow);
    controller.setDrawingColor('#00ff00');

    expect(controller.getLines()[0].color).toBe(DEFAULT_DRAWING_LINE_COLOR);
  });

  it('exposes no API to recolor an existing line (color is fixed once drawn)', () => {
    const { controller } = setup();

    expect('setLineColor' in controller).toBe(false);
  });

  it('getLines() exposes width alongside color (structure only, no UI yet)', () => {
    const { controller, container, fireCrosshairMove } = setup();

    drawOneLine(container, fireCrosshairMove, fakeWindow);

    expect(controller.getLines()[0].width).toBe(DEFAULT_TREND_LINE_WIDTH);
  });

  it('changing the color mid-drag does not affect the in-progress line (color is fixed at draw start)', () => {
    const { controller, container, series, fireCrosshairMove } = setup();

    container.dispatch('mousedown', { clientX: 10, clientY: 10 });
    fireCrosshairMove({ point: { x: 50, y: 60 }, time: 50 as unknown as Time, paneIndex: 0 } as MouseEventParams<Time>);
    controller.setDrawingColor('#ff00ff');
    fakeWindow.dispatch('mouseup', {});

    const primitive = series.attachPrimitive.mock.calls[0][0] as { style: { color: string } };
    expect(primitive.style.color).toBe(DEFAULT_DRAWING_LINE_COLOR);
    expect(controller.getLines()[0].color).toBe(DEFAULT_DRAWING_LINE_COLOR);
    // 之後才開始畫的線才吃新顏色。
    drawSecondLine(container, fireCrosshairMove);
    expect(controller.getLines()[1].color).toBe('#ff00ff');
  });
});

describe('DrawingController touch gestures (responsive3)', () => {
  let fakeWindow: ReturnType<typeof createFakeEventTarget>;

  beforeEach(() => {
    fakeWindow = createFakeEventTarget();
    vi.stubGlobal('window', fakeWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup() {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });
    controller.setEnabled(true);
    return { controller, container, series, fireCrosshairMove };
  }

  /** 假 TouchEvent：只需要 `touches.length`、第一指座標與 `preventDefault`。 */
  function touchEvent(points: { clientX: number; clientY: number }[]) {
    return { touches: points, preventDefault: vi.fn() };
  }

  it('single-finger drag draws a line just like the mouse path', () => {
    const { controller, container, fireCrosshairMove } = setup();

    container.dispatch('touchstart', touchEvent([{ clientX: 10, clientY: 10 }]));
    fireCrosshairMove({ point: { x: 50, y: 60 }, time: 50 as unknown as Time, paneIndex: 0 } as MouseEventParams<Time>);
    container.dispatch('touchend', {});

    expect(controller.getLines()).toHaveLength(1);
  });

  it('a second finger landing mid-drag discards the in-progress line', () => {
    const { controller, container, series, fireCrosshairMove } = setup();

    container.dispatch('touchstart', touchEvent([{ clientX: 10, clientY: 10 }]));
    fireCrosshairMove({ point: { x: 50, y: 60 }, time: 50 as unknown as Time, paneIndex: 0 } as MouseEventParams<Time>);
    expect(series.attachPrimitive).toHaveBeenCalledTimes(1);

    // 第二指落下＝縮放意圖：預覽線立刻卸下，之後的 crosshair 與放開都不該再定案任何線。
    container.dispatch(
      'touchstart',
      touchEvent([
        { clientX: 10, clientY: 10 },
        { clientX: 200, clientY: 200 },
      ]),
    );
    expect(series.detachPrimitive).toHaveBeenCalledTimes(1);

    fireCrosshairMove({ point: { x: 300, y: 300 }, time: 300 as unknown as Time, paneIndex: 0 } as MouseEventParams<Time>);
    container.dispatch('touchend', {});

    expect(controller.getLines()).toEqual([]);
    expect(series.attachPrimitive).toHaveBeenCalledTimes(1);
  });

  it('a two-finger touchstart never begins a drag', () => {
    const { controller, container, series, fireCrosshairMove } = setup();

    container.dispatch(
      'touchstart',
      touchEvent([
        { clientX: 10, clientY: 10 },
        { clientX: 200, clientY: 200 },
      ]),
    );
    fireCrosshairMove({ point: { x: 50, y: 60 }, time: 50 as unknown as Time, paneIndex: 0 } as MouseEventParams<Time>);
    container.dispatch('touchend', {});

    expect(series.attachPrimitive).not.toHaveBeenCalled();
    expect(controller.getLines()).toEqual([]);
  });

  it('preventDefault on touchmove only while a single-finger drag is in progress', () => {
    const { container } = setup();

    // 尚未按下：不攔截，讓圖表／頁面維持原本行為。
    const beforeDrag = touchEvent([{ clientX: 10, clientY: 10 }]);
    container.dispatch('touchmove', beforeDrag);
    expect(beforeDrag.preventDefault).not.toHaveBeenCalled();

    container.dispatch('touchstart', touchEvent([{ clientX: 10, clientY: 10 }]));

    const dragging = touchEvent([{ clientX: 20, clientY: 20 }]);
    container.dispatch('touchmove', dragging);
    expect(dragging.preventDefault).toHaveBeenCalled();

    // 多指：不攔截也不畫，手勢交還給瀏覽器／圖表。
    const pinching = touchEvent([
      { clientX: 20, clientY: 20 },
      { clientX: 200, clientY: 200 },
    ]);
    container.dispatch('touchmove', pinching);
    expect(pinching.preventDefault).not.toHaveBeenCalled();
  });
});

describe('DrawingController.addLine (share2)', () => {
  let fakeWindow: ReturnType<typeof createFakeEventTarget>;

  beforeEach(() => {
    fakeWindow = createFakeEventTarget();
    vi.stubGlobal('window', fakeWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup() {
    const { chart, fireCrosshairMove } = createFakeChart();
    const series = createFakeSeries(chart);
    const container = createFakeContainer();
    const controller = new DrawingController({ chart, series, container });
    return { controller, container, series, fireCrosshairMove };
  }

  const POINTS = [
    { time: '2024-01-02' as unknown as Time, price: 593.5 },
    { time: '2024-03-15' as unknown as Time, price: 780.25 },
  ] as const;

  it('attaches a line with the given points and style, and reports it in getLines()', () => {
    const { controller, series } = setup();

    const id = controller.addLine(POINTS, { color: '#ff0000', width: 4 });

    expect(series.attachPrimitive).toHaveBeenCalledTimes(1);
    expect(controller.getLines()).toEqual([
      { id, points: [POINTS[0], POINTS[1]], color: '#ff0000', width: 4 },
    ]);
  });

  it('falls back to the current drawing color when no style is given', () => {
    const { controller } = setup();

    controller.setDrawingColor('#00ff00');
    controller.addLine(POINTS);

    expect(controller.getLines()[0].color).toBe('#00ff00');
    expect(controller.getLines()[0].width).toBe(DEFAULT_TREND_LINE_WIDTH);
  });

  it('shares the id sequence with the drag path so restored and drawn lines never collide', () => {
    const { controller, container, fireCrosshairMove } = setup();

    const restoredId = controller.addLine(POINTS);
    controller.setEnabled(true);
    drawOneLine(container, fireCrosshairMove, fakeWindow);

    expect(restoredId).toBe('line-1');
    expect(controller.getLines().map((line) => line.id)).toEqual(['line-1', 'line-2']);
  });

  it('notifies line-change listeners', () => {
    const { controller } = setup();
    const listener = vi.fn();
    controller.onLinesChange(listener);

    controller.addLine(POINTS);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toHaveLength(1);
  });

  it('produces lines that deleteLine()/clearAll()/highlightLine() treat like drawn ones', () => {
    const { controller, series } = setup();

    const id = controller.addLine(POINTS);
    controller.highlightLine(id);
    expect(series.attachPrimitive.mock.calls[0][0].selected).toBe(true);

    controller.deleteLine(id);

    expect(series.detachPrimitive).toHaveBeenCalledTimes(1);
    expect(controller.getLines()).toEqual([]);
  });
});
