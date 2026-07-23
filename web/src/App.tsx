import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChartContainer, type ChartHandle } from './components/chart/ChartContainer';
import { ChartToolbar } from './components/chart/ChartToolbar';
import { DrawingToolbar } from './components/chart/DrawingToolbar';
import { IndicatorLegend } from './components/chart/IndicatorLegend';
import { IndicatorPanel } from './components/chart/IndicatorPanel';
import { DesktopLayout } from './components/layout/DesktopLayout';
import { MobileLayout } from './components/layout/MobileLayout';
import { ShareMenu } from './components/share/ShareMenu';
import { DataSourcePanel } from './components/sidebar/DataSourcePanel';
import { DrawingListPanel } from './components/sidebar/DrawingListPanel';
import { SidebarSection } from './components/sidebar/SidebarSection';
import { useResponsive } from './hooks/useResponsive';
import { DEFAULT_DRAWING_LINE_COLOR } from './lib/chart/colors';
import type { DrawnLine } from './lib/chart/drawing/drawingController';
import { keepSelection, selectionAfterCollapse, toggleSelection } from './lib/chart/drawing/lineSelection';
import './lib/chart/indicators/ma';
import './lib/chart/indicators/bollinger';
import './lib/chart/indicators/macd';
import { getIndicator } from './lib/chart/indicators/registry';
import type { IndicatorInstance, IndicatorParamValues } from './lib/chart/indicators/types';
import { DEFAULT_DATA_SOURCE, estimateRequestCount, fetchBars, type DataSource } from './lib/data/dataSource';
import type { DateRange, FetchProgress, OhlcvBar } from './lib/data/types';
import { screenshotFileName } from './lib/share/imageShare';
import type { ShareLine } from './lib/state/schema';
import {
  formatShareHash,
  readShareHash,
  toIndicatorInstances,
  toShareIndicators,
  toShareLines,
  toTrendLinePoints,
} from './lib/state/shareUrl';
import { findByCode } from './lib/stock/search';
import { applySubmittedCode } from './lib/stock/selection';
import { loadStockList } from './lib/stock/stockList';
import type { SymbolSelection } from './lib/stock/types';
import './App.css';

const DEFAULT_STOCK_NO = '2330';
const QUERY_MONTHS = 6;

/** 代號連續送出（Enter／下拉選取／查詢鈕）時的緩衝：快速連打只有最後一次真的發出請求。 */
const QUERY_DEBOUNCE_MS = 300;

const OFFICIAL_MARKET_UNKNOWN_NOTICE =
  '代號不在股票清單內，官方源無法判斷市場別；圖表仍顯示前一次查詢結果，請改用 Yahoo 或改查其他代號';

const SHARE_INVALID_NOTICE = '分享連結無法解析（可能被截斷或改動過），已改用預設畫面';

function lastMonthsRange(months: number): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { start: iso(start), end: iso(now) };
}

function App() {
  const breakpoint = useResponsive();

  // 只在掛載當下讀一次 hash：之後 hash 由本 App 自己 replaceState 維護，不需要（也不該）反覆回讀。
  const [initialShare] = useState(() => readShareHash(window.location.hash));
  const restored = initialShare.status === 'ok' ? initialShare.state : null;

  const [symbol, setSymbol] = useState<SymbolSelection>({ code: restored?.symbol ?? DEFAULT_STOCK_NO, market: null });
  const stockNo = symbol.code;
  const [dataSource, setDataSource] = useState<DataSource>(restored?.prov ?? DEFAULT_DATA_SOURCE);
  // 查詢區間目前沒有 UI，但要能被分享連結還原，因此收進 state 而非每次查詢重算。
  const [range] = useState<DateRange>(() => restored?.range ?? lastMonthsRange(QUERY_MONTHS));
  const [bars, setBars] = useState<OhlcvBar[]>([]);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 「這次沒有查詢、畫面沿用前一次結果」的說明，與 error（查詢失敗）分開。
  const [notice, setNotice] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(
    initialShare.status === 'invalid' ? SHARE_INVALID_NOTICE : null,
  );
  const [indicators, setIndicators] = useState<IndicatorInstance[]>(() =>
    toIndicatorInstances(restored?.indicators ?? []),
  );
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingColor, setDrawingColor] = useState(DEFAULT_DRAWING_LINE_COLOR);
  // 設定面板：桌面版是側邊欄（預設展開），行動版是 bottom sheet（預設收合，見下方斷點 effect）。
  const [settingsOpen, setSettingsOpen] = useState(() => breakpoint === 'desktop');
  const [indicatorSectionCollapsed, setIndicatorSectionCollapsed] = useState(false);
  const [drawingSectionCollapsed, setDrawingSectionCollapsed] = useState(false);
  const [lines, setLines] = useState<DrawnLine[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const chartRef = useRef<ChartHandle | null>(null);
  /**
   * 待還原的分享線條（share2）。線條要等第一批 K 線資料到位才重建：
   * `ChartContainer` 會在 `stockNo` 變動（含首次掛載）時 `clearAll()`，太早加會被清掉。
   */
  const pendingLinesRef = useRef<ShareLine[]>(restored?.lines ?? []);

  // 訂閱身分需穩定，否則每次 render 都會重新訂閱 DrawingController。
  const handleLinesChange = useCallback((next: DrawnLine[]) => {
    setLines(next);
    setSelectedLineId((prev) => keepSelection(prev, next));
  }, []);

  /*
   * 佈局切換只換掉 chrome（頁首高度、設定面板位置），圖表元件不重建，
   * 但容器高度會變 → 這裡在 DOM 更新後、瀏覽器繪製前主動 resize。
   * 只靠 ChartContainer 的 ResizeObserver 會晚一幀，中間先閃一次舊尺寸。
   */
  useLayoutEffect(() => {
    chartRef.current?.resize();
  }, [breakpoint]);

  // 切到行動版就收起設定面板（responsive2 的「預設只顯示圖表+精簡工具列」）；
  // 反向不自動展開，桌面版側邊欄維持使用者當下的選擇。
  useEffect(() => {
    if (breakpoint === 'mobile') setSettingsOpen(false);
  }, [breakpoint]);

  // 折疊畫線清單或收起整個設定面板時取消選取，圖上高亮同時消失（sidebar3）。
  useEffect(() => {
    setSelectedLineId((prev) => selectionAfterCollapse(prev, !settingsOpen, drawingSectionCollapsed));
  }, [settingsOpen, drawingSectionCollapsed]);

  // 分享連結的線條還原（share2）：等第一批資料進圖後一次補上，之後這個 ref 就永遠是空的。
  useEffect(() => {
    const pending = pendingLinesRef.current;
    if (pending.length === 0 || bars.length === 0) return;
    const chart = chartRef.current;
    if (!chart) return;

    pendingLinesRef.current = [];
    for (const line of pending) {
      chart.addLine(toTrendLinePoints(line), { color: line.color, width: line.width });
    }
  }, [bars]);

  // 目前畫面狀態同步回 hash（share2）：用 replaceState 而非 pushState，避免灌爆瀏覽器上一頁記錄。
  useEffect(() => {
    // 還原未完成前先不要寫，否則會用「還沒補上線條」的狀態覆蓋掉連結裡的線。
    if (pendingLinesRef.current.length > 0) return;

    try {
      const hash = formatShareHash({
        symbol: stockNo,
        prov: dataSource,
        range,
        indicators: toShareIndicators(indicators),
        lines: toShareLines(lines),
      });
      window.history.replaceState(null, '', hash);
    } catch {
      // 編碼失敗只代表這次沒更新網址（例如出現無法編碼的參數值），不該影響畫面。
    }
  }, [stockNo, dataSource, range, indicators, lines]);

  function addIndicator(definitionId: string) {
    const definition = getIndicator(definitionId);
    if (!definition) return;

    const params = Object.fromEntries(definition.paramsSchema.map((schema) => [schema.key, schema.default]));
    setIndicators((prev) => [...prev, { id: crypto.randomUUID(), definitionId, params }]);
  }

  function removeIndicator(instanceId: string) {
    setIndicators((prev) => prev.filter((instance) => instance.id !== instanceId));
  }

  function updateIndicatorParams(instanceId: string, params: IndicatorParamValues) {
    setIndicators((prev) => prev.map((instance) => (instance.id === instanceId ? { ...instance, params } : instance)));
  }

  // 代號可能來自下拉建議、手動輸入或（未來）URL 還原，一律回頭查清單補上市場別，
  // 順便把代號正規化成清單裡的寫法（例如 00631l → 00631L）。查無此代號則維持 null。
  useEffect(() => {
    if (symbol.market !== null) return;

    let cancelled = false;
    loadStockList()
      .then((list) => {
        const entry = findByCode(list, symbol.code);
        if (!cancelled && entry) setSymbol({ code: entry.code, market: entry.market });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Yahoo 對上市/上櫃通用、不需要市場別，因此代號補上市場別時不必重查；官方源才依市場別路由。
  const routingMarket = dataSource === 'official' ? symbol.market : null;

  useEffect(() => {
    // 官方源在市場別補上前無從路由（剛送出的代號、或代號不在清單內）：不查詢也不清空既有資料，
    // 圖表沿用前一次結果並在 header 說明原因（側邊欄資料源區塊另有路由層級的警告）。
    if (dataSource === 'official' && routingMarket === null) {
      setProgress(null);
      setNotice(OFFICIAL_MARKET_UNKNOWN_NOTICE);
      return;
    }

    const controller = new AbortController();
    setError(null);
    setNotice(null);
    setProgress({ loaded: 0, total: estimateRequestCount(dataSource, range) });

    // 進度回饋立即顯示，實際請求延後送出：連續切代號時只有最後一次會真的打到上游。
    const timer = setTimeout(() => {
      fetchBars(dataSource, stockNo, routingMarket, range, setProgress, controller.signal)
        .then(setBars)
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setBars([]);
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setProgress(null));
    }, QUERY_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [stockNo, dataSource, routingMarket, range]);

  // 行動版工具列精簡（responsive2）：標題與欄位說明只留給輔助技術，按鈕文字縮短。
  const compact = breakpoint === 'mobile';

  const header = (
    <>
      <h1 className={compact ? 'sr-only' : undefined}>TA Painter</h1>
      <ChartToolbar
        stockNo={stockNo}
        loading={progress !== null}
        compact={compact}
        onSubmit={(code) => {
          setShareNotice(null);
          setSymbol((prev) => applySubmittedCode(prev, code));
        }}
      />
      <DrawingToolbar
        drawingMode={drawingMode}
        onDrawingModeChange={setDrawingMode}
        color={drawingColor}
        onColorChange={setDrawingColor}
        compact={compact}
      />
      <ShareMenu
        takeScreenshot={() => chartRef.current?.takeScreenshot() ?? Promise.resolve(null)}
        takeScreenshotSync={() => chartRef.current?.takeScreenshotSync() ?? null}
        fileName={screenshotFileName(stockNo)}
        shareTitle={`TA Painter ${stockNo}`}
        compact={compact}
      />
      {progress && (
        <div className="progress" role="progressbar" aria-valuenow={progress.loaded} aria-valuemax={progress.total}>
          <div className="progress-bar" style={{ width: `${(progress.loaded / progress.total) * 100}%` }} />
          <span className="progress-label">
            {progress.message ?? '載入中'}（{progress.loaded}/{progress.total}）
          </span>
        </div>
      )}
      {shareNotice && (
        <p className="app-notice" role="status">
          {shareNotice}
        </p>
      )}
      {notice && (
        <p className="app-notice" role="status">
          {notice}
        </p>
      )}
    </>
  );

  // 設定區塊只給內容，外層容器（桌面側邊欄／行動 bottom sheet）由各佈局套上。
  const settings = (
    <>
      <DataSourcePanel
        value={dataSource}
        onChange={(next) => {
          setShareNotice(null);
          setDataSource(next);
        }}
        market={symbol.market}
      />
      <SidebarSection title="指標" collapsed={indicatorSectionCollapsed} onCollapsedChange={setIndicatorSectionCollapsed}>
        <IndicatorPanel
          instances={indicators}
          onAdd={addIndicator}
          onRemove={removeIndicator}
          onParamsChange={updateIndicatorParams}
        />
      </SidebarSection>
      <SidebarSection
        title={`畫線（${lines.length}）`}
        collapsed={drawingSectionCollapsed}
        onCollapsedChange={setDrawingSectionCollapsed}
      >
        <DrawingListPanel
          lines={lines}
          selectedId={selectedLineId}
          onSelect={(id) => setSelectedLineId((prev) => toggleSelection(prev, id))}
          onDelete={(id) => chartRef.current?.deleteLine(id)}
        />
      </SidebarSection>
    </>
  );

  // app-settings-open 供圖例列讓開側邊欄寬度用（見 IndicatorLegend.css）。
  return (
    <div className={`app app-${breakpoint}${settingsOpen ? ' app-settings-open' : ''}`}>
      {breakpoint === 'desktop' ? (
        <DesktopLayout
          header={header}
          settings={settings}
          settingsOpen={settingsOpen}
          onSettingsOpenChange={setSettingsOpen}
        />
      ) : (
        <MobileLayout
          header={header}
          settings={settings}
          settingsOpen={settingsOpen}
          onSettingsOpenChange={setSettingsOpen}
        />
      )}
      {/* 圖例與參數小面板兩個斷點共用，和圖表一樣不參與佈局切換。 */}
      <IndicatorLegend
        instances={indicators}
        onParamsChange={updateIndicatorParams}
        onRemove={removeIndicator}
        settingsOpen={settingsOpen}
      />
      {/*
       * 圖表刻意留在佈局切換之外：`DesktopLayout`／`MobileLayout` 只產生 chrome，
       * `<main>` 永遠是 `.app` 的同一個子節點，跨斷點時 React 不會卸載 ChartContainer
       * （否則 pan/zoom、手繪線、已載入資料都會跟著圖表實例一起重建）。
       */}
      <main className="app-main">
        {error ? (
          <p className="app-error">{error}</p>
        ) : (
          <ChartContainer
            ref={chartRef}
            data={bars}
            indicators={indicators}
            drawingMode={drawingMode}
            drawingColor={drawingColor}
            stockNo={stockNo}
            onLinesChange={handleLinesChange}
            highlightedLineId={selectedLineId}
          />
        )}
      </main>
    </div>
  );
}

export default App;
