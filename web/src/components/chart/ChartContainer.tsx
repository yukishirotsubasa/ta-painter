import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import {
  CandlestickSeries,
  createChart,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
import { createPaneIndexAllocator } from '../../lib/chart/paneIndexAllocator';
import {
  UP_COLOR,
  DOWN_COLOR,
  DEFAULT_DRAWING_LINE_COLOR,
  CHART_TEXT_COLOR,
  CHART_GRID_COLOR,
  ADJUSTMENT_LINE_COLOR,
} from '../../lib/chart/colors';
import { VerticalLinePrimitive } from '../../lib/chart/verticalLinePrimitive';
import { PRICE_PANE_INDEX, VOLUME_PANE_INDEX, RESERVED_PANE_COUNT } from '../../lib/chart/panes';
import { reconcileIndicators, type MountedIndicator } from '../../lib/chart/indicators/reconcile';
import type {
  IndicatorInstance,
  IndicatorTooltipRow,
  PaneIndexAllocator,
} from '../../lib/chart/indicators/types';
import { buildTooltipModel, type TooltipModel } from '../../lib/chart/tooltip';
import {
  takeChartScreenshotBlob,
  takeChartScreenshotBlobSync,
  type ChartScreenshotOptions,
} from '../../lib/chart/screenshot';
import { DrawingController, type DrawnLine } from '../../lib/chart/drawing/drawingController';
import type { TrendLinePoint, TrendLineStyle } from '../../lib/chart/drawing/trendLinePrimitive';
import type { OhlcvBar } from '../../lib/data/types';
import './ChartContainer.css';

/**
 * 圖表對外的指令式介面（sidebar3）：只曝光側邊欄真正需要的操作，
 * 不把整個 `DrawingController` 交出去。
 */
export interface ChartHandle {
  deleteLine(id: string): void;
  /** 清空目前所有畫線（sidebar「清空所有畫線」）；確認與否由呼叫端負責。 */
  clearAllLines(): void;
  /** share2 的 URL 還原：直接以邏輯座標＋樣式重建線條，回傳新線 id（圖表尚未建立時回傳 `null`）。 */
  addLine(points: readonly [TrendLinePoint, TrendLinePoint], style?: Partial<TrendLineStyle>): string | null;
  /** share3 的圖片分享來源：目前畫面（含手繪線）的 PNG blob，圖表尚未建立時回傳 `null`。 */
  takeScreenshot(options?: ChartScreenshotOptions): Promise<Blob | null>;
  /**
   * 同上但同步回傳（share5）：`navigator.share()` 不吃 promise 且對 user activation 嚴格，
   * 需要在 click handler 內一路同步拿到 blob。
   */
  takeScreenshotSync(options?: ChartScreenshotOptions): Blob | null;
  /**
   * 依容器目前尺寸立刻重繪（responsive1 的佈局切換）：底下的 ResizeObserver 要等下一幀才回呼，
   * 中間會先閃一次舊尺寸的圖表。
   */
  resize(): void;
}

interface ChartContainerProps {
  ref?: Ref<ChartHandle>;
  data: OhlcvBar[];
  indicators?: IndicatorInstance[];
  /** 開啟時關閉原生 pan/zoom，按下拖曳畫趨勢線（拖曳中即時預覽，放開定案）。 */
  drawingMode?: boolean;
  /** 畫線工具列目前選色（drawing7）：只套用到之後畫出的新線，既有線畫完即固定不可改色。 */
  drawingColor?: string;
  /** 股票代號，變更時清空目前所有畫線（drawing3）。 */
  stockNo?: string;
  /** 除權息／分割日（'YYYY-MM-DD'），在主圖以貫穿全高的金色垂直虛線標記。 */
  adjustmentDates?: string[];
  /** 線清單變動（新增／刪除／切股清除）時回報最新快照。 */
  onLinesChange?: (lines: DrawnLine[]) => void;
  /** 側邊欄目前選取的線，`null` 取消高亮。 */
  highlightedLineId?: string | null;
  /**
   * 可視範圍逼近左緣時回報「需要更舊的資料」（往前動態載入，見 `docs/data-layer.md`）。
   * 由呼叫端負責防重入與「已到最早」的判斷——本元件只轉述畫面狀態，不管資料怎麼來。
   */
  onNeedOlderData?: () => void;
}

const VOLUME_PANE_HEIGHT = 120;

/**
 * 可視邏輯範圍的左緣還剩幾根 K 棒就開始往前補資料。
 * 左側留白時 `from` 會是負數，因此這個門檻同時涵蓋兩件事：
 * 「資料不足以填滿畫面寬度」（初次載入後自動補到填滿）與「使用者往左捲到接近底」。
 */
const LOAD_OLDER_THRESHOLD = 10;

function toCandlestickData(bars: OhlcvBar[]): CandlestickData[] {
  return bars.map((bar) => ({
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
}

function toVolumeData(bars: OhlcvBar[]): HistogramData[] {
  return bars.map((bar) => ({
    time: bar.time,
    value: bar.volume,
    color: bar.close >= bar.open ? UP_COLOR : DOWN_COLOR,
  }));
}

/** 除權息／分割日字串轉 lightweight-charts 時間（日線一律 'YYYY-MM-DD'）。 */
function toAdjustmentTimes(dates: string[]): Time[] {
  return dates.map((date) => date as Time);
}

/** 游標與 tooltip 之間留白，且優先擺在游標右下、超出容器則翻到另一側。 */
const TOOLTIP_MARGIN = 12;

/** 以 DOM 節點（非 innerHTML）重建 tooltip 內容，label/value 一律 textContent，天然免跳脫。 */
function renderTooltip(el: HTMLDivElement, model: TooltipModel): void {
  el.replaceChildren();

  const date = document.createElement('div');
  date.className = 'chart-tooltip-date';
  date.textContent = model.date;
  el.appendChild(date);

  for (const row of model.rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'chart-tooltip-row';

    const dot = document.createElement('span');
    dot.className = 'chart-tooltip-dot';
    // 無色（K 線 OHLC、成交量）保留位置但透明，讓各列左緣對齊。
    dot.style.background = row.color ?? 'transparent';
    rowEl.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'chart-tooltip-label';
    label.textContent = row.label;
    rowEl.appendChild(label);

    const value = document.createElement('span');
    value.className = 'chart-tooltip-value';
    value.textContent = row.value;
    rowEl.appendChild(value);

    el.appendChild(rowEl);
  }
}

/** 把 tooltip 夾在容器內定位：預設游標右下，貼近右／下緣時翻向左／上。 */
function positionTooltip(el: HTMLDivElement, container: HTMLDivElement, point: { x: number; y: number }): void {
  const { clientWidth: cw, clientHeight: ch } = container;
  const tw = el.offsetWidth;
  const th = el.offsetHeight;

  let left = point.x + TOOLTIP_MARGIN;
  if (left + tw > cw) left = point.x - TOOLTIP_MARGIN - tw;
  left = Math.max(0, Math.min(left, cw - tw));

  let top = point.y + TOOLTIP_MARGIN;
  if (top + th > ch) top = Math.max(0, ch - th);

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

export function ChartContainer({
  ref,
  data,
  indicators = [],
  drawingMode = false,
  drawingColor = DEFAULT_DRAWING_LINE_COLOR,
  stockNo,
  adjustmentDates = [],
  onLinesChange,
  highlightedLineId = null,
  onNeedOlderData,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const adjustmentLinesRef = useRef<VerticalLinePrimitive | null>(null);
  const paneIndexAllocatorRef = useRef<PaneIndexAllocator | null>(null);
  const mountedIndicatorsRef = useRef<Map<string, MountedIndicator>>(new Map());
  const internalDrawingControllerRef = useRef<DrawingController | null>(null);
  /**
   * 訂閱只在掛載時建立一次（圖表實例的生命週期），但回呼身分每次 render 都會變，
   * 因此透過 ref 轉接，讓訂閱保持穩定又永遠呼叫到最新的回呼。
   */
  const onNeedOlderDataRef = useRef(onNeedOlderData);
  onNeedOlderDataRef.current = onNeedOlderData;
  /** 同上：tooltip 的 crosshair 訂閱只建立一次，透過 ref 讓它每次都讀到最新的指標清單（含順序）。 */
  const indicatorsRef = useRef(indicators);
  indicatorsRef.current = indicators;
  /** 上一批資料的第一根時間，用來判定這次是否為「往前補資料」（前插後的視圖保持）。 */
  const previousFirstTimeRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const mountedIndicators = mountedIndicatorsRef.current;
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      // 不用 autoSize：改由下方自管的 ResizeObserver 明確 resize，
      // 避免側邊欄收合/展開後圖表尺寸沒跟上（autoSize 開啟時 resize() 會被忽略，難以補救）。
      autoSize: false,
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: 'transparent' },
        textColor: CHART_TEXT_COLOR,
      },
      grid: {
        vertLines: { color: CHART_GRID_COLOR },
        horzLines: { color: CHART_GRID_COLOR },
      },
      timeScale: {
        borderVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
      },
    });

    chartRef.current = chart;
    paneIndexAllocatorRef.current = createPaneIndexAllocator(chart, RESERVED_PANE_COUNT);
    candlestickSeriesRef.current = chart.addSeries(CandlestickSeries, {}, PRICE_PANE_INDEX);
    volumeSeriesRef.current = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' } },
      VOLUME_PANE_INDEX,
    );
    chart.panes()[VOLUME_PANE_INDEX]?.setHeight(VOLUME_PANE_HEIGHT);
    const adjustmentLines = new VerticalLinePrimitive({ color: ADJUSTMENT_LINE_COLOR, width: 1, label: '息' });
    candlestickSeriesRef.current.attachPrimitive(adjustmentLines);
    adjustmentLinesRef.current = adjustmentLines;
    const drawingController = new DrawingController({
      chart,
      series: candlestickSeriesRef.current,
      container,
    });
    internalDrawingControllerRef.current = drawingController;

    // 只跟著容器實際尺寸走（視窗縮放）；側邊欄是覆蓋在圖表上的，收合不改變容器尺寸也不需要重繪。
    const resizeObserver = new ResizeObserver(() => {
      chart.resize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);

    // 左緣偵測：往前補完資料後 setVisibleLogicalRange 會再觸發一次本回呼，
    // 因此「資料不足以填滿畫面」會自動一批批補到填滿，不必另外量容器寬度換算需要幾根 K 棒。
    const onVisibleLogicalRangeChange = (range: LogicalRange | null) => {
      if (!range) return;
      if (range.from < LOAD_OLDER_THRESHOLD) onNeedOlderDataRef.current?.();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);

    // tooltip（滑鼠指到某日的資訊框）：命令式 DOM overlay，pointer-events:none 不擋畫線與 crosshair。
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tooltip';
    container.appendChild(tooltipEl);

    const onCrosshairMove = (param: MouseEventParams) => {
      const candlestickSeries = candlestickSeriesRef.current;
      const volumeSeries = volumeSeriesRef.current;
      if (!candlestickSeries || !volumeSeries) {
        tooltipEl.style.display = 'none';
        return;
      }

      // 依圖例（instances）順序攤平每個指標的 tooltip 列，未實作 tooltipRows 的指標自然略過。
      const indicatorRows: IndicatorTooltipRow[] = [];
      for (const instance of indicatorsRef.current) {
        const rows = mountedIndicators.get(instance.id)?.handle.tooltipRows?.();
        if (rows) indicatorRows.push(...rows);
      }

      const model = buildTooltipModel(param, { candlestickSeries, volumeSeries, indicatorRows });
      if (!model || !param.point) {
        tooltipEl.style.display = 'none';
        return;
      }

      renderTooltip(tooltipEl, model);
      tooltipEl.style.display = 'block';
      positionTooltip(tooltipEl, container, param.point);
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      tooltipEl.remove();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
      resizeObserver.disconnect();
      for (const entry of mountedIndicators.values()) {
        entry.handle.dispose();
      }
      mountedIndicators.clear();
      drawingController.dispose();
      internalDrawingControllerRef.current = null;
      candlestickSeriesRef.current?.detachPrimitive(adjustmentLines);
      adjustmentLinesRef.current = null;
      chartRef.current = null;
      paneIndexAllocatorRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const previousFirstTime = previousFirstTimeRef.current;
    const nextFirstTime = data.length > 0 ? data[0].time : null;

    /*
     * 往前補資料後若不校正，畫面會整個往左跳：`setData()` 是整批取代，
     * 前插 N 根會讓所有邏輯索引一起位移 N。作法是記住位移量，setData 後把可視範圍平移回去，
     * 使用者看到的 K 棒維持不變（右緣錨定）。
     *
     * `indexOf` 找不到（換股票時整批換掉、剛好新舊資料無交集）會回 -1，此時不校正、
     * 交給 lightweight-charts 預設的初次定位，避免把不相干的位移套上去。
     * 畫線是 time/price 座標，不受索引位移影響，不需處理。
     */
    const prependedCount =
      chart && previousFirstTime !== null && nextFirstTime !== null && nextFirstTime < previousFirstTime
        ? data.findIndex((bar) => bar.time === previousFirstTime)
        : -1;
    const visibleRangeBefore = prependedCount > 0 ? chart!.timeScale().getVisibleLogicalRange() : null;

    candlestickSeriesRef.current?.setData(toCandlestickData(data));
    volumeSeriesRef.current?.setData(toVolumeData(data));

    if (chart && visibleRangeBefore) {
      chart.timeScale().setVisibleLogicalRange({
        from: visibleRangeBefore.from + prependedCount,
        to: visibleRangeBefore.to + prependedCount,
      });
    }

    previousFirstTimeRef.current = nextFirstTime;
  }, [data]);

  useEffect(() => {
    adjustmentLinesRef.current?.setTimes(toAdjustmentTimes(adjustmentDates));
  }, [adjustmentDates]);

  useEffect(() => {
    const chart = chartRef.current;
    const paneIndexAllocator = paneIndexAllocatorRef.current;
    if (!chart || !paneIndexAllocator) return;

    reconcileIndicators({
      chart,
      paneIndexAllocator,
      data,
      instances: indicators,
      mounted: mountedIndicatorsRef.current,
    });
  }, [data, indicators]);

  useEffect(() => {
    internalDrawingControllerRef.current?.setEnabled(drawingMode);
  }, [drawingMode]);

  useEffect(() => {
    internalDrawingControllerRef.current?.setDrawingColor(drawingColor);
  }, [drawingColor]);

  useEffect(() => {
    internalDrawingControllerRef.current?.clearAll();
  }, [stockNo]);

  useImperativeHandle(
    ref,
    () => ({
      deleteLine: (id: string) => internalDrawingControllerRef.current?.deleteLine(id),
      clearAllLines: () => internalDrawingControllerRef.current?.clearAll(),
      addLine: (points, style) => internalDrawingControllerRef.current?.addLine(points, style) ?? null,
      takeScreenshot: async (options) => {
        const chart = chartRef.current;
        return chart ? await takeChartScreenshotBlob(chart, options) : null;
      },
      takeScreenshotSync: (options) => {
        const chart = chartRef.current;
        return chart ? takeChartScreenshotBlobSync(chart, options) : null;
      },
      resize: () => {
        const chart = chartRef.current;
        const container = containerRef.current;
        if (chart && container) chart.resize(container.clientWidth, container.clientHeight);
      },
    }),
    [],
  );

  useEffect(() => {
    const controller = internalDrawingControllerRef.current;
    if (!controller || !onLinesChange) return;

    // 訂閱前先同步一次目前狀態，避免訂閱建立前已畫的線沒出現在清單。
    onLinesChange(controller.getLines());
    return controller.onLinesChange(onLinesChange);
  }, [onLinesChange]);

  useEffect(() => {
    internalDrawingControllerRef.current?.highlightLine(highlightedLineId);
  }, [highlightedLineId]);

  return <div ref={containerRef} className={`chart-container${drawingMode ? ' chart-container-drawing' : ''}`} />;
}
