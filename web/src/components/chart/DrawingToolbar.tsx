import './DrawingToolbar.css';

interface DrawingToolbarProps {
  drawingMode: boolean;
  onDrawingModeChange: (enabled: boolean) => void;
  /** 目前選色（drawing7）：只套用到之後畫出的新線，畫完的線不可再改色。 */
  color: string;
  onColorChange: (color: string) => void;
}

/**
 * 主畫面畫線工具列（drawing7）：畫線模式開關 + 選色器。
 * 依 sidebar1 規劃，畫線模式開關留在主畫面而非側邊欄。
 */
export function DrawingToolbar({ drawingMode, onDrawingModeChange, color, onColorChange }: DrawingToolbarProps) {
  return (
    <div className="drawing-toolbar">
      <button
        type="button"
        className="drawing-toggle"
        aria-pressed={drawingMode}
        onClick={() => onDrawingModeChange(!drawingMode)}
      >
        {drawingMode ? '畫線模式：開' : '畫線模式：關'}
      </button>
      <label className="drawing-toolbar-color-label" htmlFor="drawing-toolbar-color" title="畫線前選色，畫出後不可更改">
        線色
        <input
          id="drawing-toolbar-color"
          className="drawing-toolbar-color"
          type="color"
          value={color}
          onChange={(event) => onColorChange(event.target.value)}
        />
      </label>
    </div>
  );
}
