import './DrawingToolbar.css';

interface DrawingToolbarProps {
  drawingMode: boolean;
  onDrawingModeChange: (enabled: boolean) => void;
  /** 目前選色（drawing7）：只套用到之後畫出的新線，畫完的線不可再改色。 */
  color: string;
  onColorChange: (color: string) => void;
  /** 行動版精簡工具列（responsive2）：只留短標籤與色塊，狀態靠 aria-pressed 的高亮樣式表達。 */
  compact?: boolean;
}

/**
 * 主畫面畫線工具列（drawing7）：畫線模式開關 + 選色器。
 * 依 sidebar1 規劃，畫線模式開關留在主畫面而非側邊欄。
 *
 * 用 fieldset/legend 把兩個控制項框成一組（實測回饋：原本並排的色塊看不出是給畫線用的）：
 * 外框 + 「畫線」標題點出兩者同屬一功能，色塊左邊再放一段用目前顏色畫的線段預覽，
 * 直接說明「這個顏色就是等一下畫出來的線」。畫線模式開啟時整組高亮。
 */
export function DrawingToolbar({
  drawingMode,
  onDrawingModeChange,
  color,
  onColorChange,
  compact = false,
}: DrawingToolbarProps) {
  return (
    <fieldset className={`drawing-toolbar${drawingMode ? ' drawing-toolbar-active' : ''}`}>
      <legend className="drawing-toolbar-legend">畫線</legend>
      <button
        type="button"
        className="drawing-toggle"
        aria-pressed={drawingMode}
        aria-label={compact ? '畫線模式' : undefined}
        onClick={() => onDrawingModeChange(!drawingMode)}
      >
        {compact ? '畫線' : drawingMode ? '模式：開' : '模式：關'}
      </button>
      <label className="drawing-toolbar-color-label" htmlFor="drawing-toolbar-color" title="畫線前選色，畫出後不可更改">
        <span className={compact ? 'sr-only' : undefined}>線色</span>
        {/* 用目前顏色畫的線段預覽，讓色塊與「畫出來的線」直接對上。 */}
        <svg className="drawing-toolbar-preview" viewBox="0 0 28 16" aria-hidden="true">
          <line x1="2" y1="13" x2="26" y2="3" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <input
          id="drawing-toolbar-color"
          className="drawing-toolbar-color"
          type="color"
          value={color}
          onChange={(event) => onColorChange(event.target.value)}
        />
      </label>
    </fieldset>
  );
}
