import type {
  Coordinate,
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export interface TrendLinePoint {
  time: Time;
  price: number;
}

interface PixelPoint {
  x: Coordinate;
  y: Coordinate;
}

const LINE_COLOR = '#f5a623';
const LINE_WIDTH = 2;

class TrendLinePaneRenderer implements IPrimitivePaneRenderer {
  private readonly p1: PixelPoint | null;
  private readonly p2: PixelPoint | null;

  constructor(p1: PixelPoint | null, p2: PixelPoint | null) {
    this.p1 = p1;
    this.p2 = p2;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const { p1, p2 } = this;
    if (!p1 || !p2) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = LINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    });
  }
}

class TrendLinePaneView implements IPrimitivePaneView {
  private readonly source: TrendLinePrimitive;
  private p1: PixelPoint | null = null;
  private p2: PixelPoint | null = null;

  constructor(source: TrendLinePrimitive) {
    this.source = source;
  }

  /** 每次 viewport 變動（縮放/resize/滾動）都會被呼叫，重新把邏輯座標（time+price）轉成當下 pixel 座標。 */
  update(): void {
    const chart = this.source.chart;
    const series = this.source.series;
    const points = this.source.points;

    if (!chart || !series || !points) {
      this.p1 = null;
      this.p2 = null;
      return;
    }

    this.p1 = toPixelPoint(chart, series, points[0]);
    this.p2 = toPixelPoint(chart, series, points[1]);
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new TrendLinePaneRenderer(this.p1, this.p2);
  }
}

function toPixelPoint(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  point: TrendLinePoint,
): PixelPoint | null {
  const x = chart.timeScale().timeToCoordinate(point.time);
  const y = series.priceToCoordinate(point.price);
  if (x === null || y === null) return null;
  return { x, y };
}

/**
 * 畫線 spike：儲存邏輯座標（time+price）而非 pixel，
 * paneView.update() 內即時轉換，確保縮放/resize/pan 後線條不跑位。
 */
export class TrendLinePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType, Time> | null = null;
  points: [TrendLinePoint, TrendLinePoint] | null = null;

  private readonly paneView = new TrendLinePaneView(this);
  private requestUpdateFn: (() => void) | null = null;

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdateFn = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdateFn = null;
  }

  setPoints(points: [TrendLinePoint, TrendLinePoint] | null): void {
    this.points = points;
    this.requestUpdateFn?.();
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}
