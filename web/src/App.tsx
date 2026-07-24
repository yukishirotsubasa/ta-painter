import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChartContainer, type ChartHandle } from './components/chart/ChartContainer';
import { ChartToolbar } from './components/chart/ChartToolbar';
import { DrawingToolbar } from './components/chart/DrawingToolbar';
import { IndicatorLegend } from './components/chart/IndicatorLegend';
import { IndicatorPanel } from './components/chart/IndicatorPanel';
import { DesktopLayout } from './components/layout/DesktopLayout';
import { MobileLayout } from './components/layout/MobileLayout';
import { ShareMenu } from './components/share/ShareMenu';
import { AdjustedPriceToggle } from './components/sidebar/AdjustedPriceToggle';
import { DataSourcePanel } from './components/sidebar/DataSourcePanel';
import { DrawingListPanel } from './components/sidebar/DrawingListPanel';
import { SidebarSection } from './components/sidebar/SidebarSection';
import { useResponsive } from './hooks/useResponsive';
import { DEFAULT_DRAWING_LINE_COLOR } from './lib/chart/colors';
import type { DrawnLine } from './lib/chart/drawing/drawingController';
import { keepSelection, selectionAfterCollapse, toggleSelection } from './lib/chart/drawing/lineSelection';
import './lib/chart/indicators/registerAll';
import { getIndicator } from './lib/chart/indicators/registry';
import type { IndicatorInstance, IndicatorParamValues } from './lib/chart/indicators/types';
import {
  DEFAULT_DATA_SOURCE,
  OLDER_BATCH_MONTHS,
  estimateRequestCount,
  fetchBars,
  type DataSource,
} from './lib/data/dataSource';
import { classifyDataError, type DataErrorKind } from './lib/data/errors';
import { detectAdjustmentDates, toAdjustedBars } from './lib/data/adjustment';
import { addMonths, mergeOlderBars, previousDay } from './lib/data/history';
import type { DateRange, FetchProgress, OhlcvBar } from './lib/data/types';
import { screenshotFileName } from './lib/share/imageShare';
import { loadSettings, saveSettings } from './lib/state/persistence';
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

/** 只在判定為上游被擋／掛掉時追加：資料源反爬蟲規則隨時可能變動，使用者無從自行排除。 */
const UPSTREAM_BLOCKED_HINT = '資料源可能已失效（上游擋掉或服務異常），並非你的輸入有誤；若持續發生請聯絡製作者。';

function lastMonthsRange(months: number): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { start: iso(start), end: iso(now) };
}

function App() {
  const breakpoint = useResponsive();

  // 只在掛載當下讀一次 hash：之後不再隨操作回寫 hash，也不回讀（見 docs/share.md 的「分享連結的產生時機」）。
  const [initialShare] = useState(() => readShareHash(window.location.hash));
  const restored = initialShare.status === 'ok' ? initialShare.state : null;

  /*
   * Session 模式（見 docs/persistence.md）：
   * - hash 有合法 s= → 預覽模式：狀態全部從分享連結還原，該 session 不讀也不寫 localStorage，
   *   避免分享內容污染使用者的本機設定（退出見下方 exitPreview）。
   * - 否則（無 hash 或 hash 解析失敗）→ 一般模式：從 localStorage 還原本機設定。
   */
  const [previewMode, setPreviewMode] = useState(restored !== null);
  const [initialSettings] = useState(() => (restored ? null : loadSettings()));

  const [symbol, setSymbol] = useState<SymbolSelection>({
    code: restored?.symbol ?? initialSettings?.symbol ?? DEFAULT_STOCK_NO,
    market: null,
  });
  const stockNo = symbol.code;
  // 股票名稱（分享圖片的標題列用）：Web Share 走同步截圖，不能截圖當下才查清單，故先備在 state。
  const [symbolName, setSymbolName] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>(
    restored?.prov ?? initialSettings?.prov ?? DEFAULT_DATA_SOURCE,
  );
  // 「使用還原價」開關（分享→本機→預設 false，與 symbol/prov 一致）。
  const [useAdjusted, setUseAdjusted] = useState(
    restored?.useAdjusted ?? initialSettings?.useAdjusted ?? false,
  );
  /**
   * 首批查詢區間：分享連結可還原（否則取最近 QUERY_MONTHS 個月）。
   * 這只是**起點**——實際載入範圍會隨往左捲動往前延伸，見 `earliestLoaded`。
   */
  const [initialRange] = useState<DateRange>(() => restored?.range ?? lastMonthsRange(QUERY_MONTHS));
  const [bars, setBars] = useState<OhlcvBar[]>([]);
  /** 目前已載入到的最早日期：往前補一批就往前推一次。分享連結要用，故也放進 state。 */
  const [earliestLoaded, setEarliestLoaded] = useState(initialRange.start);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /*
   * 往前載入的三個控制旗標一律用 ref 而非 state：`.finally()` 解鎖的時機早於 React 重新 render，
   * 中間若又觸發左緣事件，讀 state 的舊 closure 會拿到尚未更新的區間而重複請求同一段
   * （更糟的是重複那段不含更舊的資料 → 可視範圍不動 → 再次觸發，形成迴圈）。
   * 改成 ref 後「已請求到哪」在送出當下就同步推進，重複觸發必然是 no-op 或推進到更舊的一批。
   */
  const loadingOlderRef = useRef(false);
  /** 往前補到空資料（已達上市初期）或失敗後就不再請求，避免無限往前打。 */
  const hasMoreHistoryRef = useRef(true);
  const earliestLoadedRef = useRef(initialRange.start);
  /** 目前的「資料身分」；往前查詢回來時比對，期間換過股票／資料源就丟棄結果。 */
  const dataIdentityRef = useRef('');
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  // 帶分類是為了決定要不要在原始訊息下方追加 UPSTREAM_BLOCKED_HINT。
  const [error, setError] = useState<{ message: string; kind: DataErrorKind } | null>(null);
  // 「這次沒有查詢、畫面沿用前一次結果」的說明，與 error（查詢失敗）分開。
  const [notice, setNotice] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(
    initialShare.status === 'invalid' ? SHARE_INVALID_NOTICE : null,
  );
  const [indicators, setIndicators] = useState<IndicatorInstance[]>(() =>
    toIndicatorInstances(restored?.indicators ?? initialSettings?.indicators ?? []),
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
   * 一併記下當初要還原的股票代號（share6）：連結的第一次查詢失敗時 pending 會留著，
   * 若不綁代號，使用者接著改查別支股票就會把線畫到不相干的標的上。
   */
  const pendingLinesRef = useRef<{ stockNo: string; lines: ShareLine[] } | null>(
    restored ? { stockNo: restored.symbol, lines: restored.lines } : null,
  );

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

  // 分享連結的線條還原（share2）：等第一批資料進圖後一次補上，之後這個 ref 就永遠是 null。
  useEffect(() => {
    const pending = pendingLinesRef.current;
    if (!pending || bars.length === 0) return;
    const chart = chartRef.current;
    if (!chart) return;

    // 資料到位的是別支股票（連結那次查詢失敗後使用者改查其他代號）：線條直接丟棄（share6）。
    const matched = pending.stockNo === stockNo;
    pendingLinesRef.current = null;
    if (!matched) return;

    for (const line of pending.lines) {
      chart.addLine(toTrendLinePoints(line), { color: line.color, width: line.width });
    }
  }, [bars, stockNo]);

  // 本機設定持久化：一般模式才寫，預覽模式（分享連結開啟）一律不寫，避免污染本機設定。
  // 這裡也不回寫 hash——網址平時保持乾淨，分享連結改由「分享URL」按鈕即時產生（見 buildShareUrl）。
  useEffect(() => {
    if (previewMode) return;
    saveSettings({ symbol: stockNo, prov: dataSource, indicators: toShareIndicators(indicators), useAdjusted });
  }, [previewMode, stockNo, dataSource, indicators, useAdjusted]);

  // 「分享URL」按下時才由目前狀態即時組出連結；編碼失敗（罕見）往上丟，由按鈕顯示複製失敗提示。
  const buildShareUrl = useCallback(() => {
    const hash = formatShareHash({
      symbol: stockNo,
      prov: dataSource,
      // 分享目前**實際載入到**的範圍（會隨捲動往前延伸），對方開連結才看得到同一段。
      range: { start: earliestLoaded, end: initialRange.end },
      indicators: toShareIndicators(indicators),
      lines: toShareLines(lines),
      useAdjusted,
    });
    const { origin, pathname, search } = window.location;
    return `${origin}${pathname}${search}${hash}`;
  }, [stockNo, dataSource, earliestLoaded, initialRange.end, indicators, lines, useAdjusted]);

  // 退出預覽、回到本機設定：套回 localStorage 設定（沒有就回預設）、清掉分享線、拿掉 hash。
  const exitPreview = useCallback(() => {
    const settings = loadSettings();
    setPreviewMode(false);
    setSymbol({ code: settings?.symbol ?? DEFAULT_STOCK_NO, market: null });
    setDataSource(settings?.prov ?? DEFAULT_DATA_SOURCE);
    setIndicators(toIndicatorInstances(settings?.indicators ?? []));
    setUseAdjusted(settings?.useAdjusted ?? false);
    // 分享線不持久化，退出時一併清掉（若代號有變，切股本來就會清；代號相同時這行才有作用）。
    chartRef.current?.clearAllLines();
    // 拿掉 hash，重整不再回到預覽。
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

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

  // 代號變動時查清單補上股票名稱：查無此代號則為 null，標題列只顯示代號。
  useEffect(() => {
    let cancelled = false;
    loadStockList()
      .then((list) => {
        if (!cancelled) setSymbolName(findByCode(list, stockNo)?.name ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [stockNo]);

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

  // 換股票／換資料源時重設往前載入的狀態，並讓還在飛的往前查詢作廢。
  useEffect(() => {
    dataIdentityRef.current = `${stockNo}|${dataSource}`;
    loadingOlderRef.current = false;
    setLoadingOlder(false);
  }, [stockNo, dataSource]);

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
    setProgress({ loaded: 0, total: estimateRequestCount(dataSource, initialRange) });
    /*
     * 首批查詢一律從空資料開始：新舊標的的 bars 若混在一起，
     * `ChartContainer` 的前插判定會拿舊標的的第一根時間去比對而誤判位移。
     * 同時把往前載入的狀態歸零，讓新標的從 initialRange 重新往前延伸。
     */
    setBars([]);
    setEarliestLoaded(initialRange.start);
    earliestLoadedRef.current = initialRange.start;
    hasMoreHistoryRef.current = true;

    // 進度回饋立即顯示，實際請求延後送出：連續切代號時只有最後一次會真的打到上游。
    const timer = setTimeout(() => {
      fetchBars(dataSource, stockNo, routingMarket, initialRange, setProgress, controller.signal)
        .then(setBars)
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setBars([]);
          setError({
            message: err instanceof Error ? err.message : String(err),
            kind: classifyDataError(err),
          });
        })
        .finally(() => setProgress(null));
    }, QUERY_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [stockNo, dataSource, routingMarket, initialRange]);

  /**
   * 往前補一批更舊的資料（見 docs/data-layer.md 的「往前動態載入」）。由 `ChartContainer` 在可視範圍逼近左緣時呼叫，
   * 因此也負責「首批資料不足以填滿畫面寬度」的自動補齊——補完的 setVisibleLogicalRange
   * 會再觸發一次左緣事件，一批批補到填滿為止。
   */
  const loadOlderBars = useCallback(() => {
    // 首批還沒到位就不補：此時左緣事件只是初始渲染的雜訊，區間也還沒定案。
    if (loadingOlderRef.current || !hasMoreHistoryRef.current || bars.length === 0) return;
    // 官方源在市場別未知時無從路由，與首批查詢同一條守門規則。
    if (dataSource === 'official' && routingMarket === null) return;

    const identity = dataIdentityRef.current;
    const end = previousDay(earliestLoadedRef.current);
    const start = addMonths(earliestLoadedRef.current, -OLDER_BATCH_MONTHS[dataSource]);

    loadingOlderRef.current = true;
    // 送出當下就推進，重複觸發只會往更舊的一批走，不會再請求同一段。
    earliestLoadedRef.current = start;
    setLoadingOlder(true);

    fetchBars(dataSource, stockNo, routingMarket, { start, end })
      .then((older) => {
        // 查詢期間換過股票／資料源：這批資料屬於上一個標的，丟棄。
        if (dataIdentityRef.current !== identity) return;

        if (older.length === 0) {
          // 整批都沒有資料視為已到上市初期，就此停手（否則會一路往前空打到 1970 年）。
          hasMoreHistoryRef.current = false;
          return;
        }
        setBars((prev) => mergeOlderBars(older, prev));
        setEarliestLoaded(start);
      })
      // 往前補失敗不影響已顯示的資料，靜靜停手即可（首批查詢失敗才需要顯示錯誤）。
      .catch(() => {
        if (dataIdentityRef.current === identity) hasMoreHistoryRef.current = false;
      })
      .finally(() => {
        if (dataIdentityRef.current !== identity) return;
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      });
  }, [bars.length, dataSource, routingMarket, stockNo]);

  /*
   * 還原價衍生資料：只有 Yahoo 源有 adjClose，官方源一律不還原（開關也 disabled）。
   * 開關開啟時把整份 bars 換成還原版本，K 線與所有指標同步套用（見 docs/… 的整張圖還原決策）。
   * useMemo 讓 bars/開關未變時 displayBars 參考穩定，避免 reconcileIndicators 無謂重算。
   */
  const canAdjust = dataSource === 'yahoo';
  const effectiveAdjusted = useAdjusted && canAdjust;
  const displayBars = useMemo(
    () => (effectiveAdjusted ? toAdjustedBars(bars) : bars),
    [bars, effectiveAdjusted],
  );
  // 除權息／分割日一律從原始 bars 偵測（factor 跳階），兩種模式都標示。
  const adjustmentDates = useMemo(() => detectAdjustmentDates(bars), [bars]);

  // 行動版工具列精簡（responsive2）：標題與欄位說明只留給輔助技術，按鈕文字縮短。
  const compact = breakpoint === 'mobile';

  // 分享圖片標題列：有股名時「股名 代號」，否則只有代號。
  const shareHeaderLabel = symbolName ? `${symbolName} ${stockNo}` : stockNo;

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
        takeScreenshot={() => chartRef.current?.takeScreenshot({ headerLabel: shareHeaderLabel }) ?? Promise.resolve(null)}
        takeScreenshotSync={() => chartRef.current?.takeScreenshotSync({ headerLabel: shareHeaderLabel }) ?? null}
        fileName={screenshotFileName(stockNo)}
        shareTitle={`TA Painter ${stockNo}`}
        buildShareUrl={buildShareUrl}
        compact={compact}
      />
      {previewMode && (
        <div className="app-preview-banner" role="status">
          <span>正在瀏覽分享內容（不會影響你的本機設定）</span>
          <button type="button" className="app-preview-exit" onClick={exitPreview}>
            回到我的設定
          </button>
        </div>
      )}
      {progress && (
        <div className="progress" role="progressbar" aria-valuenow={progress.loaded} aria-valuemax={progress.total}>
          <div className="progress-bar" style={{ width: `${(progress.loaded / progress.total) * 100}%` }} />
          <span className="progress-label">
            {progress.message ?? '載入中'}（{progress.loaded}/{progress.total}）
          </span>
        </div>
      )}
      {loadingOlder && (
        <p className="app-notice" role="status">
          載入更舊資料…
        </p>
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
      <AdjustedPriceToggle checked={useAdjusted} onChange={setUseAdjusted} disabled={dataSource === 'official'} />

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
          onClearAll={() => {
            // 一次清光多條線不可逆，先跳窗確認再清（單條刪除成本低，不另外確認）。
            if (window.confirm(`確定清空全部 ${lines.length} 條畫線？`)) {
              chartRef.current?.clearAllLines();
            }
          }}
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
          <div className="app-error">
            <p>{error.message}</p>
            {error.kind === 'upstream-blocked' ? <p className="app-error-hint">{UPSTREAM_BLOCKED_HINT}</p> : null}
          </div>
        ) : (
          <ChartContainer
            ref={chartRef}
            data={displayBars}
            indicators={indicators}
            drawingMode={drawingMode}
            drawingColor={drawingColor}
            stockNo={stockNo}
            adjustmentDates={adjustmentDates}
            onLinesChange={handleLinesChange}
            highlightedLineId={selectedLineId}
            onNeedOlderData={loadOlderBars}
          />
        )}
      </main>
    </div>
  );
}

export default App;
