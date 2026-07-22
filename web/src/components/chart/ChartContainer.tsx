import { useEffect, useRef } from 'react';
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
import { getIndicator } from '../../lib/chart/indicators/registry';
import type { IndicatorInstance, IndicatorMountHandle, PaneIndexAllocator } from '../../lib/chart/indicators/types';
import { DrawingController } from '../../lib/chart/drawing/drawingController';
import type { OhlcvBar } from '../../lib/data/types';
import './ChartContainer.css';

interface ChartContainerProps {
  data: OhlcvBar[];
  indicators?: IndicatorInstance[];
  /** 開啟時關閉原生 pan/zoom，按下拖曳畫趨勢線（拖曳中即時預覽，放開定案）。 */
  drawingMode?: boolean;
  /** 股票代號，變更時清空目前所有畫線（drawing3）。 */
  stockNo?: string;
}

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

export function ChartContainer({ data, indicators = [], drawingMode = false, stockNo }: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const paneIndexAllocatorRef = useRef<PaneIndexAllocator | null>(null);
  const mountedIndicatorsRef = useRef<Map<string, IndicatorMountHandle>>(new Map());
  const drawingControllerRef = useRef<DrawingController | null>(null);

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
    drawingControllerRef.current = new DrawingController({
      chart,
      series: candlestickSeriesRef.current,
      container,
    });

    return () => {
      for (const handle of mountedIndicators.values()) {
        handle.dispose();
      }
      mountedIndicators.clear();
      drawingControllerRef.current?.dispose();
      drawingControllerRef.current = null;
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
    drawingControllerRef.current?.setEnabled(drawingMode);
  }, [drawingMode]);

  useEffect(() => {
    drawingControllerRef.current?.clearAll();
  }, [stockNo]);

  return <div ref={containerRef} className={`chart-container${drawingMode ? ' chart-container-drawing' : ''}`} />;
}
