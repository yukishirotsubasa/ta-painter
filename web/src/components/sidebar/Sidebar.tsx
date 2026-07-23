import type { ReactNode } from 'react';
import './Sidebar.css';

interface SidebarProps {
  /** 收合後只留窄條與展開鈕；寬度變化由 CSS transition 動畫，圖表靠 autoSize（ResizeObserver）跟著 resize。 */
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  children: ReactNode;
}

/** 設定側邊欄容器：整體可折疊，內容由呼叫端以 `SidebarSection` 組裝（資料源／指標／畫線）。 */
export function Sidebar({ collapsed, onCollapsedChange, children }: SidebarProps) {
  return (
    <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? '展開設定側邊欄' : '收合設定側邊欄'}
        title={collapsed ? '展開設定' : '收合設定'}
        onClick={() => onCollapsedChange(!collapsed)}
      >
        {collapsed ? '»' : '«'}
      </button>
      {/* 收合時整段移除，避免隱藏內容仍可被 Tab 聚焦。 */}
      {!collapsed && <div className="sidebar-body">{children}</div>}
    </aside>
  );
}
