import { describe, expect, it, vi } from 'vitest';
import type { IChartApi, SeriesAttachedParameter, Time } from 'lightweight-charts';
import { VerticalLinePrimitive } from './verticalLinePrimitive';

/** 記錄 renderer 實際畫到 canvas 的呼叫，驗證垂直線的座標與樣式。 */
function createRecordingDrawTarget() {
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  };
  const target = {
    useBitmapCoordinateSpace: (cb: (scope: unknown) => void) =>
      cb({ context: ctx, horizontalPixelRatio: 1, verticalPixelRatio: 1, mediaSize: { width: 300, height: 200 } }),
  };
  return { ctx, target };
}

function stubAttachedParam(timeToCoordinate: (time: Time) => number | null = (time) => Number(time)): {
  param: SeriesAttachedParameter<Time>;
  requestUpdate: ReturnType<typeof vi.fn>;
} {
  const requestUpdate = vi.fn();
  const chart = { timeScale: () => ({ timeToCoordinate }) } as unknown as IChartApi;
  return {
    param: { chart, series: {}, requestUpdate, horzScaleBehavior: {} } as unknown as SeriesAttachedParameter<Time>,
    requestUpdate,
  };
}

function attachedPrimitive(times: Time[], timeToCoordinate?: (time: Time) => number | null) {
  const primitive = new VerticalLinePrimitive({ color: '#facc15', width: 1, label: '息' });
  primitive.attached(stubAttachedParam(timeToCoordinate).param);
  primitive.setTimes(times);
  primitive.updateAllViews();
  return primitive;
}

describe('VerticalLinePrimitive', () => {
  it('draws a full-height vertical line per date at its time coordinate', () => {
    const primitive = attachedPrimitive([100 as Time, 250 as Time]);

    const { ctx, target } = createRecordingDrawTarget();
    primitive.paneViews()[0]?.renderer()?.draw(target as never);

    // 每條線一次 moveTo(x, 0) + lineTo(x, height=200)。
    expect(ctx.moveTo.mock.calls).toEqual([
      [100, 0],
      [250, 0],
    ]);
    expect(ctx.lineTo.mock.calls).toEqual([
      [100, 200],
      [250, 200],
    ]);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.strokeStyle).toBe('#facc15');
  });

  it('renders the label text at each line top when provided', () => {
    const primitive = attachedPrimitive([100 as Time]);

    const { ctx, target } = createRecordingDrawTarget();
    primitive.paneViews()[0]?.renderer()?.draw(target as never);

    expect(ctx.fillText).toHaveBeenCalledWith('息', 100, 2);
  });

  it('skips dates outside the visible range (coordinate resolves to null)', () => {
    // 第一個時間在範圍內、第二個在範圍外。
    const primitive = attachedPrimitive([100 as Time, 999 as Time], (time) => (Number(time) > 500 ? null : Number(time)));

    const { ctx, target } = createRecordingDrawTarget();
    primitive.paneViews()[0]?.renderer()?.draw(target as never);

    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(100, 0);
  });

  it('draws nothing before being attached or given times', () => {
    const primitive = new VerticalLinePrimitive({ color: '#facc15', width: 1 });
    primitive.updateAllViews();

    const draw = vi.fn();
    primitive.paneViews()[0]?.renderer()?.draw({ useBitmapCoordinateSpace: draw } as never);

    expect(draw).not.toHaveBeenCalled();
  });

  it('stops rendering after detached', () => {
    const primitive = attachedPrimitive([100 as Time]);
    primitive.detached();
    primitive.updateAllViews();

    const draw = vi.fn();
    primitive.paneViews()[0]?.renderer()?.draw({ useBitmapCoordinateSpace: draw } as never);

    expect(draw).not.toHaveBeenCalled();
  });

  it('calls requestUpdate when times change', () => {
    const primitive = new VerticalLinePrimitive({ color: '#facc15', width: 1 });
    const { param, requestUpdate } = stubAttachedParam();
    primitive.attached(param);

    primitive.setTimes([1 as Time]);

    expect(requestUpdate).toHaveBeenCalledTimes(1);
  });
});
