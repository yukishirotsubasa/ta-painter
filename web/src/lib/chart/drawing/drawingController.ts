import {
  CrosshairMode,
  TrackingModeExitMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
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
 * 供 clearAll()（drawing3 切股清除）與多線管理／選取刪除（drawing4）使用。
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

  /** mousedown/touchstart 當下命中的線（若有），放開時若沒發生拖曳才會真的變成選取。 */
  private pendingSelection: TrendLinePrimitive | null = null;
  private selectedLine: TrendLinePrimitive | null = null;

  constructor(options: DrawingControllerOptions) {
    this.chart = options.chart;
    this.series = options.series;
    this.container = options.container;

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.endDrag = this.endDrag.bind(this);
    this.onCrosshairMove = this.onCrosshairMove.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;

    // 畫線模式與原生 pan/zoom 互斥。
    // crosshair 預設 Magnet 模式會把座標吸附到最近K棒的收盤價，導致拖曳終點與觸點位置產生偏移，
    // 畫線時需要 Normal 模式取得未吸附的原始座標，離開畫線模式再吸附回來。
    // trackingMode 預設 exitMode 是 OnNextTap：觸控放開後 tracking mode 不會自動結束，
    // 下一次 touchstart 會把「上一條線放開時的 crosshair 座標」當成新的追蹤基準點、與這次
    // 觸點位置的差值疊加，導致第二條起之後每條線的終點都被前一條線的結束位置污染而越畫越偏。
    // 改成 OnTouchEnd 讓每次放開都真正結束 tracking mode，下一條線才會是全新的 1:1 座標追蹤。
    this.chart.applyOptions({
      handleScroll: !enabled,
      handleScale: !enabled,
      crosshair: { mode: enabled ? CrosshairMode.Normal : CrosshairMode.Magnet },
      trackingMode: { exitMode: enabled ? TrackingModeExitMode.OnTouchEnd : TrackingModeExitMode.OnNextTap },
    });

    if (enabled) {
      this.container.addEventListener('mousedown', this.onMouseDown);
      this.container.addEventListener('touchstart', this.onTouchStart, { passive: true });
      this.container.addEventListener('touchmove', this.onTouchMove, { passive: false });
      this.container.addEventListener('touchend', this.endDrag);
      this.container.addEventListener('touchcancel', this.endDrag);
      window.addEventListener('mouseup', this.endDrag);
      window.addEventListener('keydown', this.onKeyDown);
      this.chart.subscribeCrosshairMove(this.onCrosshairMove);
    } else {
      this.discardActiveLine();
      this.setSelectedLine(null);
      this.container.removeEventListener('mousedown', this.onMouseDown);
      this.container.removeEventListener('touchstart', this.onTouchStart);
      this.container.removeEventListener('touchmove', this.onTouchMove);
      this.container.removeEventListener('touchend', this.endDrag);
      this.container.removeEventListener('touchcancel', this.endDrag);
      window.removeEventListener('mouseup', this.endDrag);
      window.removeEventListener('keydown', this.onKeyDown);
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
    this.selectedLine = null;
  }

  dispose(): void {
    this.setEnabled(false);
    this.clearAll();
  }

  private relativeXY(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private pointFromClientXY(clientX: number, clientY: number): TrendLinePoint | null {
    const { x, y } = this.relativeXY(clientX, clientY);

    const mainPaneHeight = this.chart.panes()[MAIN_PANE_INDEX]?.getHeight();
    if (mainPaneHeight !== undefined && y > mainPaneHeight) return null;

    const time = this.chart.timeScale().coordinateToTime(x);
    if (time === null) return null;
    const price = this.series.coordinateToPrice(y);
    if (price === null) return null;
    return { time, price };
  }

  /** 由後往前找，命中最上層（最後畫的）那條線，找不到回傳 null。 */
  private hitTestLines(x: number, y: number): TrendLinePrimitive | null {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (this.lines[i].hitTest(x, y) !== null) return this.lines[i];
    }
    return null;
  }

  private setSelectedLine(line: TrendLinePrimitive | null): void {
    if (this.selectedLine === line) return;
    this.selectedLine?.setSelected(false);
    this.selectedLine = line;
    this.selectedLine?.setSelected(true);
  }

  /** 刪除目前選取的線（Delete/Backspace 觸發），只從陣列移除該條，其餘線不受影響。 */
  private deleteSelectedLine(): void {
    if (!this.selectedLine) return;
    const index = this.lines.indexOf(this.selectedLine);
    if (index !== -1) this.lines.splice(index, 1);
    this.series.detachPrimitive(this.selectedLine);
    this.selectedLine = null;
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
      // 真的拖出了一條新線：放棄本次的選取候選，維持原本選取狀態不變。
      this.lines.push(this.activeLine);
    } else {
      // 純點擊（未拖曳）：命中線條就選取，點空白處則清除選取。
      this.setSelectedLine(this.pendingSelection);
    }
    this.activeLine = null;
    this.dragging = false;
    this.anchor = null;
    this.pendingSelection = null;
  }

  private onMouseDown(event: MouseEvent): void {
    const { x, y } = this.relativeXY(event.clientX, event.clientY);
    this.pendingSelection = this.hitTestLines(x, y);
    this.beginDrag(event.clientX, event.clientY);
  }

  private onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;
    const { x, y } = this.relativeXY(touch.clientX, touch.clientY);
    this.pendingSelection = this.hitTestLines(x, y);
    this.beginDrag(touch.clientX, touch.clientY);
  }

  private onTouchMove(event: TouchEvent): void {
    if (this.dragging) event.preventDefault();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.selectedLine) return;
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    event.preventDefault();
    this.deleteSelectedLine();
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
