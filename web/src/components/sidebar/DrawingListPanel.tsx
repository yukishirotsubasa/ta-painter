import type { DrawnLine } from '../../lib/chart/drawing/drawingController';
import { formatLineLabel } from '../../lib/chart/drawing/lineLabel';
import './DrawingListPanel.css';

interface DrawingListPanelProps {
  lines: DrawnLine[];
  selectedId: string | null;
  /** 只回報被點到的 id，選取／取消選取的切換規則在 `lineSelection.toggleSelection`。 */
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** 清空所有畫線；跳窗確認由呼叫端（App）負責，這裡只在有線時顯示按鈕並轉呼。 */
  onClearAll: () => void;
}

/**
 * 側邊欄畫線清單（sidebar3）：僅提供檢視、選取高亮與刪除單條，
 * 取代 drawing6 移除的畫布點擊選取路徑，觸控／桌面通用（不需鍵盤）。
 */
export function DrawingListPanel({ lines, selectedId, onSelect, onDelete, onClearAll }: DrawingListPanelProps) {
  if (lines.length === 0) {
    return <p className="drawing-list-empty">尚未畫任何線</p>;
  }

  return (
    <>
      <div className="drawing-list-toolbar">
        <p className="drawing-list-hint">點項目可高亮圖上對應線段，再點一次取消</p>
        <button type="button" className="drawing-list-clear-all" onClick={onClearAll}>
          清空所有
        </button>
      </div>
      <ul className="drawing-list">
        {lines.map((line, index) => (
          <li key={line.id} className={`drawing-list-item${line.id === selectedId ? ' is-selected' : ''}`}>
            <button
              type="button"
              className="drawing-list-select"
              aria-pressed={line.id === selectedId}
              onClick={() => onSelect(line.id)}
            >
              <span className="drawing-list-swatch" style={{ background: line.color }} aria-hidden="true" />
              {formatLineLabel(index)}
            </button>
            <button
              type="button"
              className="drawing-list-delete"
              aria-label={`刪除 ${formatLineLabel(index)}`}
              onClick={() => onDelete(line.id)}
            >
              刪除
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
