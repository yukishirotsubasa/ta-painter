import { describe, expect, it, vi } from 'vitest';
import type { IChartApi, ISeriesApi, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';
import { DEFAULT_TREND_LINE_WIDTH, TrendLinePrimitive } from './trendLinePrimitive';
import { DEFAULT_DRAWING_LINE_COLOR } from '../colors';

/** 記錄 renderer 實際套用到 canvas context 的樣式，用來驗證 draw() 讀的是線自身的 color/width。 */
function createRecordingDrawTarget() {
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  };
  const target = {
    useBitmapCoordinateSpace: (cb: (scope: unknown) => void) =>
      cb({ context: ctx, horizontalPixelRatio: 1, verticalPixelRatio: 1 }),
  };
  return { ctx, target };
}

function attachedPrimitiveWithPoints(style?: { color?: string; width?: number }) {
  const primitive = new TrendLinePrimitive(style);
  const { param } = stubAttachedParam();
  primitive.attached(param);
  primitive.setPoints([
    { time: 100 as Time, price: 5 },
    { time: 200 as Time, price: 8 },
  ]);
  return primitive;
}

function stubAttachedParam(overrides?: {
  timeToCoordinate?: (time: Time) => number | null;
  priceToCoordinate?: (price: number) => number | null;
}): { param: SeriesAttachedParameter<Time>; requestUpdate: ReturnType<typeof vi.fn> } {
  const timeToCoordinate = overrides?.timeToCoordinate ?? ((time: Time) => Number(time));
  const priceToCoordinate = overrides?.priceToCoordinate ?? ((price: number) => price * 10);
  const requestUpdate = vi.fn();

  const chart = {
    timeScale: () => ({ timeToCoordinate }),
  } as unknown as IChartApi;

  const series = {
    priceToCoordinate,
  } as unknown as ISeriesApi<SeriesType, Time>;

  return {
    param: { chart, series, requestUpdate, horzScaleBehavior: {} } as unknown as SeriesAttachedParameter<Time>,
    requestUpdate,
  };
}

describe('TrendLinePrimitive', () => {
  it('draws nothing before being attached or given points', () => {
    const primitive = new TrendLinePrimitive();
    primitive.updateAllViews();

    const draw = vi.fn();
    primitive.paneViews()[0]?.renderer()?.draw({ useBitmapCoordinateSpace: draw } as any);

    expect(draw).not.toHaveBeenCalled();
  });

  it('converts logical time/price points to pixel coordinates on update', () => {
    const primitive = new TrendLinePrimitive();
    const { param } = stubAttachedParam();
    primitive.attached(param);
    primitive.setPoints([
      { time: 100 as Time, price: 5 },
      { time: 200 as Time, price: 8 },
    ]);
    primitive.updateAllViews();

    const draw = vi.fn((cb: (scope: unknown) => void) =>
      cb({
        context: { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), scale: vi.fn() },
        horizontalPixelRatio: 1,
        verticalPixelRatio: 1,
      }),
    );
    primitive.paneViews()[0]?.renderer()?.draw({ useBitmapCoordinateSpace: draw } as any);

    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('calls requestUpdate when points change', () => {
    const primitive = new TrendLinePrimitive();
    const { param, requestUpdate } = stubAttachedParam();
    primitive.attached(param);

    primitive.setPoints([
      { time: 1 as Time, price: 1 },
      { time: 2 as Time, price: 2 },
    ]);

    expect(requestUpdate).toHaveBeenCalledTimes(1);
  });

  it('drops chart/series references and stops rendering after detached', () => {
    const primitive = new TrendLinePrimitive();
    const { param } = stubAttachedParam();
    primitive.attached(param);
    primitive.setPoints([
      { time: 1 as Time, price: 1 },
      { time: 2 as Time, price: 2 },
    ]);
    primitive.detached();
    primitive.updateAllViews();

    const draw = vi.fn();
    primitive.paneViews()[0]?.renderer()?.draw({ useBitmapCoordinateSpace: draw } as any);

    expect(draw).not.toHaveBeenCalled();
  });

  it('skips drawing when a point falls outside the visible range (coordinate resolves to null)', () => {
    const primitive = new TrendLinePrimitive();
    const { param } = stubAttachedParam({ timeToCoordinate: () => null });
    primitive.attached(param);
    primitive.setPoints([
      { time: 1 as Time, price: 1 },
      { time: 2 as Time, price: 2 },
    ]);
    primitive.updateAllViews();

    const draw = vi.fn();
    primitive.paneViews()[0]?.renderer()?.draw({ useBitmapCoordinateSpace: draw } as any);

    expect(draw).not.toHaveBeenCalled();
  });
});

describe('TrendLinePrimitive line-level style (drawing7)', () => {
  it('defaults to the shared drawing line color and width', () => {
    const primitive = new TrendLinePrimitive();
    expect(primitive.style).toEqual({ color: DEFAULT_DRAWING_LINE_COLOR, width: DEFAULT_TREND_LINE_WIDTH });
  });

  it('draws with the per-line color/width given at construction, not a module-level constant', () => {
    const primitive = attachedPrimitiveWithPoints({ color: '#ff0000', width: 5 });
    primitive.updateAllViews();

    const { ctx, target } = createRecordingDrawTarget();
    primitive.paneViews()[0]?.renderer()?.draw(target as any);

    expect(ctx.strokeStyle).toBe('#ff0000');
    expect(ctx.lineWidth).toBe(5);
  });

  it('selected lines double their own width and keep their own color for the handles', () => {
    const primitive = attachedPrimitiveWithPoints({ color: '#ff0000', width: 5 });
    primitive.setSelected(true);
    primitive.updateAllViews();

    const { ctx, target } = createRecordingDrawTarget();
    primitive.paneViews()[0]?.renderer()?.draw(target as any);

    expect(ctx.lineWidth).toBe(10);
    expect(ctx.fillStyle).toBe('#ff0000');
    expect(ctx.arc).toHaveBeenCalledTimes(2);
  });

  it('keeps each line independent: two primitives render with their own colors', () => {
    const a = attachedPrimitiveWithPoints({ color: '#00aa00' });
    const b = attachedPrimitiveWithPoints({ color: '#0000bb' });

    a.updateAllViews();
    b.updateAllViews();
    const drawA = createRecordingDrawTarget();
    const drawB = createRecordingDrawTarget();
    a.paneViews()[0]?.renderer()?.draw(drawA.target as any);
    b.paneViews()[0]?.renderer()?.draw(drawB.target as any);

    expect(drawA.ctx.strokeStyle).toBe('#00aa00');
    expect(drawB.ctx.strokeStyle).toBe('#0000bb');
  });
});
