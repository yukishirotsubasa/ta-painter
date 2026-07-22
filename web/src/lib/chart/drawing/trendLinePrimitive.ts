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
const SELECTED_LINE_WIDTH = 3;
const SELECTED_HANDLE_RADIUS = 4;
const HIT_TEST_TOLERANCE_PX = 6;

class TrendLinePaneRenderer implements IPrimitivePaneRenderer {
  private readonly p1: PixelPoint | null;
  private readonly p2: PixelPoint | null;
  private readonly selected: boolean;

  constructor(p1: PixelPoint | null, p2: PixelPoint | null, selected: boolean) {
    this.p1 = p1;
    this.p2 = p2;
    this.selected = selected;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const { p1, p2, selected } = this;
    if (!p1 || !p2) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = selected ? SELECTED_LINE_WIDTH : LINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      if (selected) {
        ctx.fillStyle = LINE_COLOR;
        for (const p of [p1, p2]) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, SELECTED_HANDLE_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    });
  }
}

class TrendLinePaneView implements IPrimitivePaneView {
  private readonly source: TrendLinePrimitive;
  private p1: PixelPoint | null = null;
  private p2: PixelPoint | null = null;
  private selected = false;

  constructor(source: TrendLinePrimitive) {
    this.source = source;
  }

  /** 每次 viewport 變動（縮放/resize/滾動）都會被呼叫，重新把邏輯座標（time+price）轉成當下 pixel 座標。 */
  update(): void {
    const chart = this.source.chart;
    const series = this.source.series;
    const points = this.source.points;

    this.selected = this.source.selected;

    if (!chart || !series || !points) {
      this.p1 = null;
      this.p2 = null;
      return;
    }

    this.p1 = toPixelPoint(chart, series, points[0]);
    this.p2 = toPixelPoint(chart, series, points[1]);
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new TrendLinePaneRenderer(this.p1, this.p2, this.selected);
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

/** 點到線段的最短像素距離（用於點擊命中判定）。 */
function distanceToSegment(x: number, y: number, p1: PixelPoint, p2: PixelPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(x - p1.x, y - p1.y);

  const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lengthSq));
  const projX = p1.x + t * dx;
  const projY = p1.y + t * dy;
  return Math.hypot(x - projX, y - projY);
}

/**
 * 畫線 spike：儲存邏輯座標（time+price）而非 pixel，
 * paneView.update() 內即時轉換，確保縮放/resize/pan 後線條不跑位。
 */
export class TrendLinePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType, Time> | null = null;
  points: [TrendLinePoint, TrendLinePoint] | null = null;
  selected = false;

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

  setSelected(selected: boolean): void {
    if (this.selected === selected) return;
    this.selected = selected;
    this.requestUpdateFn?.();
  }

  /** 判斷像素座標 (x, y) 是否落在線段附近（容許誤差 `HIT_TEST_TOLERANCE_PX`），供點擊選取使用。 */
  hitTest(x: number, y: number): boolean {
    if (!this.chart || !this.series || !this.points) return false;
    const p1 = toPixelPoint(this.chart, this.series, this.points[0]);
    const p2 = toPixelPoint(this.chart, this.series, this.points[1]);
    if (!p1 || !p2) return false;
    return distanceToSegment(x, y, p1, p2) <= HIT_TEST_TOLERANCE_PX;
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}
