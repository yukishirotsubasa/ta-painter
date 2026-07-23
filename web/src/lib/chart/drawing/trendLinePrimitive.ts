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
import { DEFAULT_DRAWING_LINE_COLOR } from '../colors';

export interface TrendLinePoint {
  time: Time;
  price: number;
}

/**
 * 線層級樣式（drawing7）：`color` 於建立時由畫線工具列的選色決定，線畫完後即固定不可更改；
 * `width` 目前僅入結構、UI 尚未開放。
 */
export interface TrendLineStyle {
  color: string;
  width: number;
}

interface PixelPoint {
  x: Coordinate;
  y: Coordinate;
}

export const DEFAULT_TREND_LINE_WIDTH = 2;

/** 被選取時在該線自身 `width` 上加粗的量，讓不同 `width` 的線選取後都有一致的視覺回饋。 */
const SELECTED_WIDTH_DELTA = 1;
const SELECTED_HANDLE_RADIUS = 4;

class TrendLinePaneRenderer implements IPrimitivePaneRenderer {
  private readonly p1: PixelPoint | null;
  private readonly p2: PixelPoint | null;
  private readonly selected: boolean;
  private readonly style: TrendLineStyle;

  constructor(p1: PixelPoint | null, p2: PixelPoint | null, selected: boolean, style: TrendLineStyle) {
    this.p1 = p1;
    this.p2 = p2;
    this.selected = selected;
    this.style = style;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const { p1, p2, selected, style } = this;
    if (!p1 || !p2) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = selected ? style.width + SELECTED_WIDTH_DELTA : style.width;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      if (selected) {
        ctx.fillStyle = style.color;
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
  private style: TrendLineStyle = { color: DEFAULT_DRAWING_LINE_COLOR, width: DEFAULT_TREND_LINE_WIDTH };

  constructor(source: TrendLinePrimitive) {
    this.source = source;
  }

  /** 每次 viewport 變動（縮放/resize/滾動）都會被呼叫，重新把邏輯座標（time+price）轉成當下 pixel 座標。 */
  update(): void {
    const chart = this.source.chart;
    const series = this.source.series;
    const points = this.source.points;

    this.selected = this.source.selected;
    this.style = { ...this.source.style };

    if (!chart || !series || !points) {
      this.p1 = null;
      this.p2 = null;
      return;
    }

    this.p1 = toPixelPoint(chart, series, points[0]);
    this.p2 = toPixelPoint(chart, series, points[1]);
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new TrendLinePaneRenderer(this.p1, this.p2, this.selected, this.style);
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
  selected = false;
  /** 線層級樣式（drawing7）；renderer 直接讀這裡，不再用模組級寫死色寬。建立後不可變更。 */
  readonly style: TrendLineStyle;

  private readonly paneView = new TrendLinePaneView(this);
  private requestUpdateFn: (() => void) | null = null;

  constructor(style?: Partial<TrendLineStyle>) {
    this.style = { color: DEFAULT_DRAWING_LINE_COLOR, width: DEFAULT_TREND_LINE_WIDTH, ...style };
  }

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

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}
