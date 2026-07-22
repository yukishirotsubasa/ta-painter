import type { IChartApi, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts';
import { TrendLinePrimitive, type TrendLinePoint } from './trendLinePrimitive';

export interface DrawingControllerOptions {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  container: HTMLElement;
}

/** 只在主圖（K 線）pane 內接受拖曳，避免用量能 pane 的 y 座標套用主圖價格軸換算出錯誤價格。 */
const MAIN_PANE_INDEX = 0;

/**
 * 畫線模式的事件處理與線條管理（drawing1 spike 的正式版）。
 * 按下拖曳互動：mousedown/touchstart 記錄起點，subscribeCrosshairMove 拖曳中即時預覽，
 * mouseup/touchend/touchcancel 放開定案。每次完整拖曳都會產生一條新線並存進陣列，
 * 供 clearAll()（drawing3 切股清除）與多線管理（drawing4）使用。
 */
export class DrawingController {
  private readonly chart: IChartApi;
  private readonly series: ISeriesApi<'Candlestick'>;
  private readonly container: HTMLElement;

  private readonly lines: TrendLinePrimitive[] = [];
  private activeLine: TrendLinePrimitive | null = null;
  private anchor: TrendLinePoint | null = null;
  private dragging = false;
  private enabled = false;

  constructor(options: DrawingControllerOptions) {
    this.chart = options.chart;
    this.series = options.series;
    this.container = options.container;

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.endDrag = this.endDrag.bind(this);
    this.onCrosshairMove = this.onCrosshairMove.bind(this);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;

    // 畫線模式與原生 pan/zoom 互斥。
    this.chart.applyOptions({ handleScroll: !enabled, handleScale: !enabled });

    if (enabled) {
      this.container.addEventListener('mousedown', this.onMouseDown);
      this.container.addEventListener('touchstart', this.onTouchStart, { passive: true });
      this.container.addEventListener('touchmove', this.onTouchMove, { passive: false });
      this.container.addEventListener('touchend', this.endDrag);
      this.container.addEventListener('touchcancel', this.endDrag);
      window.addEventListener('mouseup', this.endDrag);
      this.chart.subscribeCrosshairMove(this.onCrosshairMove);
    } else {
      this.discardActiveLine();
      this.container.removeEventListener('mousedown', this.onMouseDown);
      this.container.removeEventListener('touchstart', this.onTouchStart);
      this.container.removeEventListener('touchmove', this.onTouchMove);
      this.container.removeEventListener('touchend', this.endDrag);
      this.container.removeEventListener('touchcancel', this.endDrag);
      window.removeEventListener('mouseup', this.endDrag);
      this.chart.unsubscribeCrosshairMove(this.onCrosshairMove);
    }
  }

  /** 卸載目前所有已定案的線條並清空陣列（drawing3：切換股票時呼叫）。 */
  clearAll(): void {
    this.discardActiveLine();
    for (const line of this.lines) {
      this.series.detachPrimitive(line);
    }
    this.lines.length = 0;
  }

  dispose(): void {
    this.setEnabled(false);
    this.clearAll();
  }

  private pointFromClientXY(clientX: number, clientY: number): TrendLinePoint | null {
    const rect = this.container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const mainPaneHeight = this.chart.panes()[MAIN_PANE_INDEX]?.getHeight();
    if (mainPaneHeight !== undefined && y > mainPaneHeight) return null;

    const time = this.chart.timeScale().coordinateToTime(x);
    if (time === null) return null;
    const price = this.series.coordinateToPrice(y);
    if (price === null) return null;
    return { time, price };
  }

  private discardActiveLine(): void {
    if (this.activeLine) {
      this.series.detachPrimitive(this.activeLine);
      this.activeLine = null;
    }
    this.dragging = false;
    this.anchor = null;
  }

  private beginDrag(clientX: number, clientY: number): void {
    const point = this.pointFromClientXY(clientX, clientY);
    if (!point) return;
    this.anchor = point;
    this.dragging = true;
  }

  private endDrag(): void {
    if (this.activeLine) {
      this.lines.push(this.activeLine);
    }
    this.activeLine = null;
    this.dragging = false;
    this.anchor = null;
  }

  private onMouseDown(event: MouseEvent): void {
    this.beginDrag(event.clientX, event.clientY);
  }

  private onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    if (touch) this.beginDrag(touch.clientX, touch.clientY);
  }

  private onTouchMove(event: TouchEvent): void {
    if (this.dragging) event.preventDefault();
  }

  private onCrosshairMove(param: MouseEventParams<Time>): void {
    if (!this.dragging || !this.anchor) return;
    if (!param.point || param.time === undefined) return;
    if ((param.paneIndex ?? MAIN_PANE_INDEX) !== MAIN_PANE_INDEX) return;

    const price = this.series.coordinateToPrice(param.point.y);
    if (price === null) return;

    if (!this.activeLine) {
      this.activeLine = new TrendLinePrimitive();
      this.series.attachPrimitive(this.activeLine);
    }
    this.activeLine.setPoints([this.anchor, { time: param.time, price }]);
  }
}
