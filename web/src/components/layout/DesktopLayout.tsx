import type { ReactNode } from 'react';
import { Sidebar } from '../sidebar/Sidebar';
import './AppLayout.css';

export interface AppLayoutProps {
  /** 頁首內容：標題、代號查詢／畫線／分享工具列、載入進度與提示訊息。 */
  header: ReactNode;
  /** 設定區塊內容（資料源／指標／畫線），容器由各佈局決定：桌面版側邊欄、行動版 bottom sheet。 */
  settings: ReactNode;
  /** 設定面板是否展開；桌面版對應側邊欄收合、行動版對應 bottom sheet 開關。 */
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
}

/**
 * 桌面版 chrome：頁首橫向一列，設定側邊欄覆蓋在圖表左側。
 *
 * 只回傳 chrome、不含圖表：圖表是 `.app` 的固定子節點，切換佈局時 React 才不會
 * 卸載 `ChartContainer`（那會連 pan/zoom 與手繪線一起重建）。版面靠 `.app` 的
 * grid（row 1 頁首／row 2 圖表＋設定面板同格重疊）拼起來。
 */
export function DesktopLayout({ header, settings, settingsOpen, onSettingsOpenChange }: AppLayoutProps) {
  return (
    <>
      <header className="app-header">{header}</header>
      <Sidebar collapsed={!settingsOpen} onCollapsedChange={(collapsed) => onSettingsOpenChange(!collapsed)}>
        {settings}
      </Sidebar>
    </>
  );
}
