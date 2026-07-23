import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import {
  CandlestickSeries,
  createChart,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import { createPaneIndexAllocator } from '../../lib/chart/paneIndexAllocator';
import { UP_COLOR, DOWN_COLOR, DEFAULT_DRAWING_LINE_COLOR } from '../../lib/chart/colors';
import { getIndicator } from '../../lib/chart/indicators/registry';
import type { IndicatorInstance, IndicatorMountHandle, PaneIndexAllocator } from '../../lib/chart/indicators/types';
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
  /** share2 的 URL 還原：直接以邏輯座標＋樣式重建線條，回傳新線 id（圖表尚未建立時回傳 `null`）。 */
  addLine(points: readonly [TrendLinePoint, TrendLinePoint], style?: Partial<TrendLineStyle>): string | null;
  /** share3 的圖片分享來源：目前畫面（含手繪線）的 PNG blob，圖表尚未建立時回傳 `null`。 */
  takeScreenshot(options?: ChartScreenshotOptions): Promise<Blob | null>;
  /**
   * 同上但同步回傳（share5）：`navigator.share()` 不吃 promise 且對 user activation 嚴格，
   * 需要在 click handler 內一路同步拿到 blob。
   */
  takeScreenshotSync(options?: ChartScreenshotOptions): Blob | null;
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
  /** 線清單變動（新增／刪除／切股清除）時回報最新快照。 */
  onLinesChange?: (lines: DrawnLine[]) => void;
  /** 側邊欄目前選取的線，`null` 取消高亮。 */
  highlightedLineId?: string | null;
}

/** pane 0 = K 線、pane 1 = 量能，指標的 separate-pane 配置從 pane 2 開始。 */
const RESERVED_PANE_COUNT = 2;

const VOLUME_PANE_HEIGHT = 120;

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

export function ChartContainer({
  ref,
  data,
  indicators = [],
  drawingMode = false,
  drawingColor = DEFAULT_DRAWING_LINE_COLOR,
  stockNo,
  onLinesChange,
  highlightedLineId = null,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const paneIndexAllocatorRef = useRef<PaneIndexAllocator | null>(null);
  const mountedIndicatorsRef = useRef<Map<string, IndicatorMountHandle>>(new Map());
  const internalDrawingControllerRef = useRef<DrawingController | null>(null);

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
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#2e303a' },
        horzLines: { color: '#2e303a' },
      },
      timeScale: {
        borderVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
      },
    });

    chartRef.current = chart;
    paneIndexAllocatorRef.current = createPaneIndexAllocator(RESERVED_PANE_COUNT);
    candlestickSeriesRef.current = chart.addSeries(CandlestickSeries, {}, 0);
    volumeSeriesRef.current = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' } },
      1,
    );
    chart.panes()[1]?.setHeight(VOLUME_PANE_HEIGHT);
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

    return () => {
      resizeObserver.disconnect();
      for (const handle of mountedIndicators.values()) {
        handle.dispose();
      }
      mountedIndicators.clear();
      drawingController.dispose();
      internalDrawingControllerRef.current = null;
      chartRef.current = null;
      paneIndexAllocatorRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    candlestickSeriesRef.current?.setData(toCandlestickData(data));
    volumeSeriesRef.current?.setData(toVolumeData(data));
  }, [data]);

  useEffect(() => {
    const chart = chartRef.current;
    const paneIndexAllocator = paneIndexAllocatorRef.current;
    if (!chart || !paneIndexAllocator) return;

    const mounted = mountedIndicatorsRef.current;
    const currentIds = new Set(indicators.map((instance) => instance.id));

    for (const [id, handle] of mounted) {
      if (!currentIds.has(id)) {
        handle.dispose();
        mounted.delete(id);
      }
    }

    for (const instance of indicators) {
      const definition = getIndicator(instance.definitionId);
      if (!definition) continue;

      const existing = mounted.get(instance.id);
      if (existing) {
        existing.update(data, instance.params);
      } else {
        mounted.set(instance.id, definition.mount(chart, paneIndexAllocator, data, instance.params));
      }
    }
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
      addLine: (points, style) => internalDrawingControllerRef.current?.addLine(points, style) ?? null,
      takeScreenshot: async (options) => {
        const chart = chartRef.current;
        return chart ? await takeChartScreenshotBlob(chart, options) : null;
      },
      takeScreenshotSync: (options) => {
        const chart = chartRef.current;
        return chart ? takeChartScreenshotBlobSync(chart, options) : null;
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
