import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  createChart,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
import { createPaneIndexAllocator } from '../../lib/chart/paneIndexAllocator';
import { getIndicator } from '../../lib/chart/indicators/registry';
import type { IndicatorInstance, IndicatorMountHandle, PaneIndexAllocator } from '../../lib/chart/indicators/types';
import { TrendLinePrimitive, type TrendLinePoint } from '../../lib/chart/drawing/trendLinePrimitive';
import type { OhlcvBar } from '../../lib/data/types';
import './ChartContainer.css';

interface ChartContainerProps {
  data: OhlcvBar[];
  indicators?: IndicatorInstance[];
  /** drawing1 spike：開啟時關閉原生 pan/zoom，按下拖曳畫一條 demo 趨勢線（拖曳中即時預覽，放開定案）。 */
  drawingMode?: boolean;
}

/** 只在主圖（K 線）pane 內接受拖曳，避免用量能 pane 的 y 座標套用主圖價格軸換算出錯誤價格。 */
const MAIN_PANE_INDEX = 0;

/** pane 0 = K 線、pane 1 = 量能，指標的 separate-pane 配置從 pane 2 開始。 */
const RESERVED_PANE_COUNT = 2;

// 對齊 lightweight-charts CandlestickSeries 的預設漲跌色，讓量能柱與 K 線同色系。
const UP_COLOR = '#26a69a';
const DOWN_COLOR = '#ef5350';

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

export function ChartContainer({ data, indicators = [], drawingMode = false }: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const paneIndexAllocatorRef = useRef<PaneIndexAllocator | null>(null);
  const mountedIndicatorsRef = useRef<Map<string, IndicatorMountHandle>>(new Map());
  const trendLineRef = useRef<TrendLinePrimitive | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const mountedIndicators = mountedIndicatorsRef.current;
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      autoSize: true,
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

    return () => {
      for (const handle of mountedIndicators.values()) {
        handle.dispose();
      }
      mountedIndicators.clear();
      chartRef.current = null;
      paneIndexAllocatorRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      trendLineRef.current = null;
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
    const chart = chartRef.current;
    const series = candlestickSeriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container) return;

    // 待驗證項目 1：畫線模式開啟時關閉 handleScroll/handleScale，驗證原生 pan/zoom（含觸控）是否確實被阻擋。
    chart.applyOptions({
      handleScroll: !drawingMode,
      handleScale: !drawingMode,
    });

    if (!drawingMode) return;

    let anchor: TrendLinePoint | null = null;
    let dragging = false;

    // chart API 沒有「按下」事件可訂閱，起點座標改用 coordinateToTime/coordinateToPrice 自行換算。
    function pointFromClientXY(clientX: number, clientY: number): TrendLinePoint | null {
      const rect = container!.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      // 只在主圖（K 線）pane 內接受起點，避免用量能 pane 的 y 座標套用主圖價格軸換算出錯誤價格。
      const mainPaneHeight = chart!.panes()[MAIN_PANE_INDEX]?.getHeight();
      if (mainPaneHeight !== undefined && y > mainPaneHeight) return null;

      const time = chart!.timeScale().coordinateToTime(x);
      if (time === null) return null;
      const price = series!.coordinateToPrice(y);
      if (price === null) return null;
      return { time, price };
    }

    function beginDrag(clientX: number, clientY: number) {
      const point = pointFromClientXY(clientX, clientY);
      if (!point) return;
      anchor = point;
      dragging = true;
    }

    function endDrag() {
      dragging = false;
      anchor = null;
    }

    // 拖曳中即時預覽：用 subscribeCrosshairMove 取得目前座標，持續更新終點畫出預覽線。
    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!dragging || !anchor) return;
      if (!param.point || param.time === undefined) return;
      if ((param.paneIndex ?? MAIN_PANE_INDEX) !== MAIN_PANE_INDEX) return;

      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

      if (!trendLineRef.current) {
        trendLineRef.current = new TrendLinePrimitive();
        series.attachPrimitive(trendLineRef.current);
      }
      trendLineRef.current.setPoints([anchor, { time: param.time, price }]);
    };

    const onMouseDown = (event: MouseEvent) => beginDrag(event.clientX, event.clientY);
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) beginDrag(touch.clientX, touch.clientY);
    };
    // 拖曳中禁止瀏覽器原生觸控滾動搶走手勢（僅在 dragging 時 preventDefault，非拖曳狀態不影響頁面正常滾動）。
    const onTouchMove = (event: TouchEvent) => {
      if (dragging) event.preventDefault();
    };

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', endDrag);
    container.addEventListener('touchcancel', endDrag);
    window.addEventListener('mouseup', endDrag);
    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', endDrag);
      container.removeEventListener('touchcancel', endDrag);
      window.removeEventListener('mouseup', endDrag);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
    };
  }, [drawingMode]);

  return <div ref={containerRef} className="chart-container" />;
}
