import { describe, expect, it, vi } from 'vitest';
import type { IChartApi, ISeriesApi, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';
import { TrendLinePrimitive } from './trendLinePrimitive';

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
