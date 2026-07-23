import type { ReactNode } from 'react';

interface SidebarSectionProps {
  title: string;
  /** 折疊狀態由呼叫端持有（App），因為折疊「畫線區塊」時需連帶取消線段選取（sidebar3）。 */
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  children: ReactNode;
}

/** 側邊欄內可折疊區塊：點頂部標題折疊/展開整區。 */
export function SidebarSection({ title, collapsed, onCollapsedChange, children }: SidebarSectionProps) {
  return (
    <section className={`sidebar-section${collapsed ? ' sidebar-section-collapsed' : ''}`}>
      <button
        type="button"
        className="sidebar-section-title"
        aria-expanded={!collapsed}
        onClick={() => onCollapsedChange(!collapsed)}
      >
        <span className="sidebar-section-caret" aria-hidden="true">
          {collapsed ? '▸' : '▾'}
        </span>
        {title}
      </button>
      {!collapsed && <div className="sidebar-section-body">{children}</div>}
    </section>
  );
}
