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

/**
 * 貫穿整個 pane 的垂直事件線（除權息／分割日標註）。
 *
 * 相較 series markers 貼在 K 棒最高價上方、與 overlay 指標擠成一團，垂直線方向與指標線（多為橫向走勢）
 * 截然不同、一眼可辨，且不佔 K 棒上方空間。作法與 `drawing/trendLinePrimitive.ts` 相同：
 * 儲存邏輯座標（time），`paneView.update()` 內即時轉成當下 pixel x，縮放／resize／pan 後不跑位。
 */

export interface VerticalLineStyle {
  color: string;
  width: number;
  /** 線頂標籤文字（如「息」）；省略則只畫線。 */
  label?: string;
}

/** 線頂標籤與 pane 上緣的間距（media px）。 */
const LABEL_TOP_PADDING = 2;
const LABEL_FONT = '10px sans-serif';
/** 虛線樣式（media px）：短虛線，讓事件線讀得到又不搶戲。 */
const LINE_DASH: [number, number] = [4, 3];

class VerticalLinePaneRenderer implements IPrimitivePaneRenderer {
  private readonly xs: Coordinate[];
  private readonly style: VerticalLineStyle;

  constructor(xs: Coordinate[], style: VerticalLineStyle) {
    this.xs = xs;
    this.style = style;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this.xs.length === 0) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const height = scope.mediaSize.height;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);

      ctx.strokeStyle = this.style.color;
      ctx.lineWidth = this.style.width;
      ctx.setLineDash(LINE_DASH);
      for (const x of this.xs) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      if (this.style.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = this.style.color;
        ctx.font = LABEL_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (const x of this.xs) {
          ctx.fillText(this.style.label, x, LABEL_TOP_PADDING);
        }
      }

      ctx.restore();
    });
  }
}

class VerticalLinePaneView implements IPrimitivePaneView {
  private readonly source: VerticalLinePrimitive;
  private xs: Coordinate[] = [];

  constructor(source: VerticalLinePrimitive) {
    this.source = source;
  }

  /** 每次 viewport 變動（縮放／resize／滾動）都會被呼叫，把邏輯時間轉成當下 pixel x；範圍外者略過。 */
  update(): void {
    const chart = this.source.chart;
    if (!chart) {
      this.xs = [];
      return;
    }
    const timeScale = chart.timeScale();
    const xs: Coordinate[] = [];
    for (const time of this.source.times) {
      const x = timeScale.timeToCoordinate(time);
      if (x !== null) xs.push(x);
    }
    this.xs = xs;
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new VerticalLinePaneRenderer(this.xs, this.source.style);
  }
}

/** 一組垂直事件線；掛在主圖 series 上，`setTimes` 更新標註日期。 */
export class VerticalLinePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType, Time> | null = null;
  times: Time[] = [];
  readonly style: VerticalLineStyle;

  private readonly paneView = new VerticalLinePaneView(this);
  private requestUpdateFn: (() => void) | null = null;

  constructor(style: VerticalLineStyle) {
    this.style = style;
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

  setTimes(times: Time[]): void {
    this.times = times;
    this.requestUpdateFn?.();
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}
