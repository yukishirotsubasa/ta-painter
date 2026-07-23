import type { ReactNode } from 'react';
import './OverlayPanel.css';

interface OverlayPanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 行動版設定面板（responsive2）：直接覆蓋整個圖表區。
 *
 * 原本做成貼底的 bottom sheet，但實測面板太矮、選項擠在一起不好操作，改成整區覆蓋。
 * 覆蓋的是圖表**上方**，圖表容器尺寸不受影響（同樣是 `.app` grid row 2 的一格），
 * 關閉後圖表原樣露出、不需要 resize。開關由呼叫端決定（不渲染即關閉）。
 */
export function OverlayPanel({ title, onClose, children }: OverlayPanelProps) {
  return (
    <section className="overlay-panel" aria-label={title}>
      <header className="overlay-panel-header">
        <h2 className="overlay-panel-title">{title}</h2>
        <button type="button" className="overlay-panel-close" aria-label={`關閉${title}`} onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="overlay-panel-body">{children}</div>
    </section>
  );
}
