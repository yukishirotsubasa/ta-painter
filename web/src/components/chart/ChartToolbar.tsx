import { useState, type FormEvent } from 'react';
import './ChartToolbar.css';

interface ChartToolbarProps {
  stockNo: string;
  loading: boolean;
  onSubmit: (stockNo: string) => void;
}

export function ChartToolbar({ stockNo, loading, onSubmit }: ChartToolbarProps) {
  const [draft, setDraft] = useState(stockNo);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(stockNo);
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <form className="chart-toolbar" onSubmit={handleSubmit}>
      <label className="chart-toolbar-label" htmlFor="chart-toolbar-stock-no">
        股票代號
      </label>
      <input
        id="chart-toolbar-stock-no"
        className="chart-toolbar-input"
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={loading}
      />
      <button type="submit" className="chart-toolbar-submit" disabled={loading}>
        {loading ? '查詢中…' : '查詢'}
      </button>
    </form>
  );
}
