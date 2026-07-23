import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { resolveSubmitCode, searchStocks } from '../../lib/stock/search';
import { loadStockList } from '../../lib/stock/stockList';
import { MARKET_LABEL, type StockListEntry } from '../../lib/stock/types';
import './ChartToolbar.css';

const LISTBOX_ID = 'chart-toolbar-suggestions';

interface ChartToolbarProps {
  stockNo: string;
  loading: boolean;
  onSubmit: (stockNo: string) => void;
  /** 行動版精簡工具列（responsive2）：欄位說明只留給輔助技術讀，畫面上省下橫向空間。 */
  compact?: boolean;
}

export function ChartToolbar({ stockNo, loading, onSubmit, compact = false }: ChartToolbarProps) {
  const [draft, setDraft] = useState(stockNo);
  const [entries, setEntries] = useState<StockListEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStockList()
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      // 清單載不到只是沒有搜尋建議，輸入框仍可直接輸入代號查詢，不打擾使用者。
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // stockNo 也可能由外部改變（share2 的 URL 還原、App 依清單正規化代號大小寫），需反向同步輸入框。
  useEffect(() => {
    setDraft(stockNo);
    setOpen(false);
    setActiveIndex(-1);
    setNotice(null);
  }, [stockNo]);

  const suggestions = open ? searchStocks(entries, draft) : [];
  const activeSuggestion = activeIndex >= 0 ? suggestions[activeIndex] : undefined;

  function commit(code: string) {
    setDraft(code);
    setOpen(false);
    setActiveIndex(-1);
    setNotice(null);
    onSubmit(code);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (activeSuggestion) {
      commit(activeSuggestion.code);
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(stockNo);
      setNotice(null);
      return;
    }

    // 名稱查不到對應股票時擋在這裡，不讓「台積電」這種字串直接當 symbol 送進資料源。
    const code = resolveSubmitCode(entries, trimmed);
    if (code === null) {
      setNotice(`查無「${trimmed}」，請改用代號或從建議清單選取`);
      return;
    }
    commit(code);
  }

  function moveActive(step: number) {
    if (!open) {
      setOpen(true);
      setActiveIndex(step > 0 ? 0 : -1);
      return;
    }
    const count = suggestions.length;
    if (count === 0) return;
    setActiveIndex((prev) => {
      const next = prev + step;
      if (next < 0) return count - 1;
      if (next >= count) return -1;
      return next;
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // 中文輸入法選字中的 Enter 是「確認選字」，preventDefault 擋掉隱式送出。
    if (event.nativeEvent.isComposing) {
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <form className="chart-toolbar" onSubmit={handleSubmit}>
      <label className={`chart-toolbar-label${compact ? ' sr-only' : ''}`} htmlFor="chart-toolbar-stock-no">
        股票代號
      </label>
      <div className="chart-toolbar-field">
        <input
          id="chart-toolbar-stock-no"
          className="chart-toolbar-input"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={activeSuggestion ? `${LISTBOX_ID}-${activeIndex}` : undefined}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
            setNotice(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        {suggestions.length > 0 && (
          <ul className="chart-toolbar-suggestions" id={LISTBOX_ID} role="listbox">
            {suggestions.map((entry, index) => (
              <li
                key={entry.code}
                id={`${LISTBOX_ID}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`chart-toolbar-suggestion${index === activeIndex ? ' is-active' : ''}`}
                // 先於 blur 觸發並取消預設行為，讓輸入框不失焦，點擊才不會在下拉關閉後落空。
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(entry.code);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="chart-toolbar-suggestion-code">{entry.code}</span>
                <span className="chart-toolbar-suggestion-name">{entry.name}</span>
                <span className="chart-toolbar-suggestion-market">{MARKET_LABEL[entry.market]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit" className="chart-toolbar-submit" disabled={loading}>
        {loading ? '查詢中…' : '查詢'}
      </button>
      {notice && (
        <span className="chart-toolbar-notice" role="alert">
          {notice}
        </span>
      )}
    </form>
  );
}
