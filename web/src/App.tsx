import { useCallback, useEffect, useRef, useState } from 'react';
import { ChartContainer, type ChartHandle } from './components/chart/ChartContainer';
import { ChartToolbar } from './components/chart/ChartToolbar';
import { DrawingToolbar } from './components/chart/DrawingToolbar';
import { IndicatorPanel } from './components/chart/IndicatorPanel';
import { ShareMenu } from './components/share/ShareMenu';
import { DataSourcePanel } from './components/sidebar/DataSourcePanel';
import { DrawingListPanel } from './components/sidebar/DrawingListPanel';
import { Sidebar } from './components/sidebar/Sidebar';
import { SidebarSection } from './components/sidebar/SidebarSection';
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  // 折疊畫線清單或整個側邊欄時取消選取，圖上高亮同時消失（sidebar3）。
  useEffect(() => {
    setSelectedLineId((prev) => selectionAfterCollapse(prev, sidebarCollapsed, drawingSectionCollapsed));
  }, [sidebarCollapsed, drawingSectionCollapsed]);

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

  return (
    <div className="app">
      <header className="app-header">
        <h1>TA Painter</h1>
        <ChartToolbar
          stockNo={stockNo}
          loading={progress !== null}
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
        />
        <ShareMenu
          takeScreenshot={() => chartRef.current?.takeScreenshot() ?? Promise.resolve(null)}
          takeScreenshotSync={() => chartRef.current?.takeScreenshotSync() ?? null}
          fileName={screenshotFileName(stockNo)}
          shareTitle={`TA Painter ${stockNo}`}
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
      </header>
      <div className="app-body">
        <Sidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed}>
          <DataSourcePanel
            value={dataSource}
            onChange={(next) => {
              setShareNotice(null);
              setDataSource(next);
            }}
            market={symbol.market}
          />
          <SidebarSection
            title="指標"
            collapsed={indicatorSectionCollapsed}
            onCollapsedChange={setIndicatorSectionCollapsed}
          >
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
        </Sidebar>
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
    </div>
  );
}

export default App;
