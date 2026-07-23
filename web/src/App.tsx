import { useEffect, useState } from 'react';
import { ChartContainer } from './components/chart/ChartContainer';
import { ChartToolbar } from './components/chart/ChartToolbar';
import { DrawingToolbar } from './components/chart/DrawingToolbar';
import { IndicatorPanel } from './components/chart/IndicatorPanel';
import { DEFAULT_DRAWING_LINE_COLOR } from './lib/chart/colors';
import './lib/chart/indicators/ma';
import './lib/chart/indicators/bollinger';
import './lib/chart/indicators/macd';
import { getIndicator } from './lib/chart/indicators/registry';
import type { IndicatorInstance, IndicatorParamValues } from './lib/chart/indicators/types';
import { TwseProvider } from './lib/data/providers/twseProvider';
import { fetchDailyRange } from './lib/data/throttle';
import type { DateRange, FetchProgress, OhlcvBar } from './lib/data/types';
import { findByCode } from './lib/stock/search';
import { loadStockList } from './lib/stock/stockList';
import type { SymbolSelection } from './lib/stock/types';
import './App.css';

const DEFAULT_STOCK_NO = '2330';
const QUERY_MONTHS = 6;

function lastMonthsRange(months: number): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { start: iso(start), end: iso(now) };
}

function App() {
  // market 目前只被記錄下來，供 sidebar2 的官方源自動路由（上市→TWSE、上櫃→TPEx）使用。
  const [symbol, setSymbol] = useState<SymbolSelection>({ code: DEFAULT_STOCK_NO, market: null });
  const stockNo = symbol.code;
  const [bars, setBars] = useState<OhlcvBar[]>([]);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indicators, setIndicators] = useState<IndicatorInstance[]>([]);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingColor, setDrawingColor] = useState(DEFAULT_DRAWING_LINE_COLOR);

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

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setProgress({ loaded: 0, total: QUERY_MONTHS });

    fetchDailyRange(TwseProvider, stockNo, lastMonthsRange(QUERY_MONTHS), setProgress, controller.signal)
      .then(setBars)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setBars([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setProgress(null));

    return () => controller.abort();
  }, [stockNo]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>TA Painter</h1>
        <ChartToolbar
          stockNo={stockNo}
          loading={progress !== null}
          onSubmit={(code) => setSymbol({ code, market: null })}
        />
        <DrawingToolbar
          drawingMode={drawingMode}
          onDrawingModeChange={setDrawingMode}
          color={drawingColor}
          onColorChange={setDrawingColor}
        />
        {progress && (
          <div className="progress" role="progressbar" aria-valuenow={progress.loaded} aria-valuemax={progress.total}>
            <div className="progress-bar" style={{ width: `${(progress.loaded / progress.total) * 100}%` }} />
            <span className="progress-label">
              {progress.message ?? '載入中'}（{progress.loaded}/{progress.total}）
            </span>
          </div>
        )}
      </header>
      <IndicatorPanel
        instances={indicators}
        onAdd={addIndicator}
        onRemove={removeIndicator}
        onParamsChange={updateIndicatorParams}
      />
      {error ? (
        <p className="app-error">{error}</p>
      ) : (
        <ChartContainer
          data={bars}
          indicators={indicators}
          drawingMode={drawingMode}
          drawingColor={drawingColor}
          stockNo={stockNo}
        />
      )}
    </div>
  );
}

export default App;
