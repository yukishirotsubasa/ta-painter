import {
  CrosshairMode,
  TrackingModeExitMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
import { DEFAULT_DRAWING_LINE_COLOR } from '../colors';
import { TrendLinePrimitive, type TrendLinePoint, type TrendLineStyle } from './trendLinePrimitive';

export interface DrawingControllerOptions {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  container: HTMLElement;
}

/** 對外曝光的單條畫線資料（供 React／側邊欄檢視與操作，drawing6）。 */
export interface DrawnLine {
  id: string;
  points: readonly [TrendLinePoint, TrendLinePoint] | null;
  /** 該線的顏色（drawing7），畫線當下決定、之後不可更改，供側邊欄清單顯示色塊。 */
  color: string;
  /** 該線目前的線寬（drawing7），僅入資料結構，UI 暫不開放調整。 */
  width: number;
}

type LinesChangeListener = (lines: DrawnLine[]) => void;

/** 內部把穩定 id 與渲染用的 primitive 綁在一起。 */
interface ManagedLine {
  id: string;
  primitive: TrendLinePrimitive;
}

/** 只在主圖（K 線）pane 內接受拖曳，避免用量能 pane 的 y 座標套用主圖價格軸換算出錯誤價格。 */
const MAIN_PANE_INDEX = 0;

/**
 * 畫線模式的事件處理與線條管理（drawing1 spike 的正式版）。
 * 按下拖曳互動：mousedown/touchstart 記錄起點，subscribeCrosshairMove 拖曳中即時預覽，
 * mouseup/touchend/touchcancel 放開定案。每次完整拖曳都會產生一條新線並存進陣列。
 *
 * drawing6：每條線帶穩定 id，對外曝光 `getLines()`/`onLinesChange()`/`deleteLine()`/`highlightLine()`
 * 供 React／側邊欄清單（sidebar3）檢視、刪除與高亮；畫布點擊選取（hitTest/選取/鍵盤刪除）整條路徑已移除，
 * 選取與刪除改由側邊欄清單負責。
 *
 * drawing7：`setDrawingColor()` 決定之後畫出的新線顏色；顏色只能在畫線前指定，線一旦畫出就固定不可改
 * （選線改色因觸控/桌面上選取單條線的操作成本過高而不提供）。
 *
 * share2：`addLine()` 讓 URL 還原不必經過拖曳事件也能建立線條，與拖曳路徑共用同一份線條管理邏輯。
 *
 * responsive3：觸控只認單指——多指（縮放手勢）一律不畫線並丟棄進行中的那一筆，見 `isMultiTouch()`；
 * 瀏覽器層級的捲動／雙擊縮放則由 `.chart-container-drawing` 的 `touch-action: none` 擋掉。
 */
export class DrawingController {
  private readonly chart: IChartApi;
  private readonly series: ISeriesApi<'Candlestick'>;
  private readonly container: HTMLElement;

  private readonly lines: ManagedLine[] = [];
  private activeLine: TrendLinePrimitive | null = null;
  private anchor: TrendLinePoint | null = null;
  private dragging = false;
  private enabled = false;

  private lineIdSeq = 0;
  /** 目前選色（drawing7）：只影響「之後畫出的新線」，包含拖曳中尚未定案的那條在內的既有線都不受影響。 */
  private drawingColor = DEFAULT_DRAWING_LINE_COLOR;
  /** 目前被側邊欄高亮的線（沿用 primitive 的 selected 視覺：加粗＋端點把手）。 */
  private highlightedLine: TrendLinePrimitive | null = null;
  private readonly linesChangeListeners = new Set<LinesChangeListener>();

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

  // --- 對外清單 API（drawing6，供 React／側邊欄使用） ---

  /** 目前所有已定案線條的快照（id + 邏輯座標），不含拖曳中的 `activeLine`。 */
  getLines(): DrawnLine[] {
    return this.lines.map(({ id, primitive }) => ({
      id,
      points: primitive.points,
      color: primitive.style.color,
      width: primitive.style.width,
    }));
  }

  /**
   * 直接以一組邏輯座標＋樣式建立一條線並回傳其 id（share2 的 URL 還原路徑）。
   * 與拖曳路徑共用同一套 id 產生、attach 與清單通知邏輯，因此還原出來的線在清單／高亮／刪除上
   * 與手畫的線完全等價。`style` 省略的欄位沿用 `TrendLinePrimitive` 的預設（色用目前選色）。
   */
  addLine(points: readonly [TrendLinePoint, TrendLinePoint], style?: Partial<TrendLineStyle>): string {
    const primitive = new TrendLinePrimitive({ color: this.drawingColor, ...style });
    primitive.setPoints([points[0], points[1]]);
    this.series.attachPrimitive(primitive);

    const id = this.nextLineId();
    this.lines.push({ id, primitive });
    this.emitLinesChange();
    return id;
  }

  // --- 顏色 API（drawing7） ---

  /** 設定接下來新畫線要用的顏色；已畫出的線（含拖曳中的預覽線）不受影響。 */
  setDrawingColor(color: string): void {
    this.drawingColor = color;
  }

  getDrawingColor(): string {
    return this.drawingColor;
  }

  /** 訂閱線清單變化（畫線／刪除／切股清除時觸發），回傳取消訂閱函式。 */
  onLinesChange(listener: LinesChangeListener): () => void {
    this.linesChangeListeners.add(listener);
    return () => {
      this.linesChangeListeners.delete(listener);
    };
  }

  /** 刪除指定 id 的線（供側邊欄清單），只影響該條，其餘不受影響；找不到則 no-op。 */
  deleteLine(id: string): void {
    const index = this.lines.findIndex((line) => line.id === id);
    if (index === -1) return;
    const [removed] = this.lines.splice(index, 1);
    if (this.highlightedLine === removed.primitive) this.highlightedLine = null;
    this.series.detachPrimitive(removed.primitive);
    this.emitLinesChange();
  }

  /** 高亮指定 id 的線（供側邊欄清單 hover／選取），傳 `null` 取消高亮。 */
  highlightLine(id: string | null): void {
    const next = id === null ? null : (this.lines.find((line) => line.id === id)?.primitive ?? null);
    if (this.highlightedLine === next) return;
    this.highlightedLine?.setSelected(false);
    this.highlightedLine = next;
    this.highlightedLine?.setSelected(true);
  }

  /** 卸載目前所有已定案的線條並清空陣列（drawing3：切換股票時呼叫），並通知清單變化。 */
  clearAll(): void {
    this.discardActiveLine();
    for (const { primitive } of this.lines) {
      this.series.detachPrimitive(primitive);
    }
    this.lines.length = 0;
    this.highlightedLine = null;
    this.emitLinesChange();
  }

  dispose(): void {
    this.setEnabled(false);
    this.clearAll();
    this.linesChangeListeners.clear();
  }

  private emitLinesChange(): void {
    const snapshot = this.getLines();
    for (const listener of this.linesChangeListeners) listener(snapshot);
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
    const finished = this.activeLine;
    this.activeLine = null;
    this.dragging = false;
    this.anchor = null;
    // 純點擊（未拖出線）不產生任何線，也不通知清單變化。
    if (!finished) return;
    this.lines.push({ id: this.nextLineId(), primitive: finished });
    this.emitLinesChange();
  }

  private nextLineId(): string {
    return `line-${++this.lineIdSeq}`;
  }

  private onMouseDown(event: MouseEvent): void {
    this.beginDrag(event.clientX, event.clientY);
  }

  /**
   * 多指觸控一律不畫線（responsive3）：第二指落下代表縮放／平移意圖，
   * 此時要連「已經開始的那一筆」一起丟掉——否則第二指的 crosshair 會被當成同一次拖曳的終點，
   * 放開時定案出一條使用者沒打算畫的歪線。丟棄後 `dragging` 為 false，
   * 後續 crosshair move 與 touchend 都自然成為 no-op，不需另外記狀態。
   */
  private isMultiTouch(event: TouchEvent): boolean {
    if (event.touches.length <= 1) return false;
    this.discardActiveLine();
    return true;
  }

  private onTouchStart(event: TouchEvent): void {
    if (this.isMultiTouch(event)) return;
    const touch = event.touches[0];
    if (!touch) return;
    this.beginDrag(touch.clientX, touch.clientY);
  }

  private onTouchMove(event: TouchEvent): void {
    if (this.isMultiTouch(event)) return;
    if (this.dragging) event.preventDefault();
  }

  private onCrosshairMove(param: MouseEventParams<Time>): void {
    if (!this.dragging || !this.anchor) return;
    if (!param.point || param.time === undefined) return;
    if ((param.paneIndex ?? MAIN_PANE_INDEX) !== MAIN_PANE_INDEX) return;

    const price = this.series.coordinateToPrice(param.point.y);
    if (price === null) return;

    if (!this.activeLine) {
      this.activeLine = new TrendLinePrimitive({ color: this.drawingColor });
      this.series.attachPrimitive(this.activeLine);
    }
    this.activeLine.setPoints([this.anchor, { time: param.time, price }]);
  }
}
