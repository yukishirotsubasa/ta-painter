import { OverlayPanel } from './OverlayPanel';
import type { AppLayoutProps } from './DesktopLayout';
import './AppLayout.css';

/**
 * 行動平板版 chrome（responsive2）：頁首只留精簡工具列（代號查詢／畫線模式／分享）＋ 開設定的按鈕，
 * 其餘設定收進覆蓋整個圖表區的 `OverlayPanel`，預設收合。
 *
 * 指標圖例與參數小面板不在這裡：那組兩個斷點共用，由 App 直接掛在 `.app` 上。
 * 與 `DesktopLayout` 同樣不含圖表，理由見該檔註解。
 */
export function MobileLayout({ header, settings, settingsOpen, onSettingsOpenChange }: AppLayoutProps) {
  return (
    <>
      <header className="app-header app-header-mobile">
        {header}
        <button
          type="button"
          className="app-settings-toggle"
          aria-expanded={settingsOpen}
          onClick={() => onSettingsOpenChange(!settingsOpen)}
        >
          設定
        </button>
      </header>

      {settingsOpen && (
        <OverlayPanel title="設定" onClose={() => onSettingsOpenChange(false)}>
          {settings}
        </OverlayPanel>
      )}
    </>
  );
}
