# 設定側邊欄（`web/src/components/sidebar/`）

> 本文件記錄**已實作**的側邊欄模組：可折疊的覆蓋式側邊欄骨架（sidebar1）+ 資料源切換區塊（sidebar2）+ 已畫線清單區塊（sidebar3）。**側邊欄只用於桌面版**，行動版的設定容器改為覆蓋整個圖表區的 `OverlayPanel`（responsive2），區塊內容兩邊共用同一份節點，見 [`responsive.md`](responsive.md)。整體規劃見 `project-planning/design.md`。

## 版面結構

```tsx
<div className="app">                 {/* display: grid，rows = auto 1fr */}
  <header className="app-header">…（代號查詢、畫線工具列、分享列、進度條、notice）</header>
  <Sidebar …>                         {/* grid-row: 2，justify-self: start */}
    <DataSourcePanel … />             {/* 常駐，不折疊 */}
    <SidebarSection title="指標">…</SidebarSection>
    <SidebarSection title={`畫線（${lines.length}）`}>…</SidebarSection>
  </Sidebar>
  <IndicatorLegend … />               {/* grid-row: 2，圖例覆蓋在圖表左上 */}
  <main className="app-main">         {/* grid-row: 2，恆為滿版，overflow: hidden */}
    <ChartContainer … />
  </main>
</div>
```

**側邊欄採覆蓋式，不擠壓圖表**（人工驗證後的決策）：展開時直接遮住左側 K 線，收合成 32px 窄條後被遮的部分重新露出，圖表容器尺寸自始至終不變、**不觸發任何 resize**。因此 `.sidebar` 需要不透明背景（`background: var(--bg)`），否則底下的圖表會透出來。

> responsive1 把版面從「`.app-body` + `position: absolute`」改成 `.app` 的兩列 grid：側邊欄與 `.app-main` 同屬 `grid-row: 2 / grid-column: 1`，靠 `z-index` 疊在同一格上，覆蓋效果與先前完全相同但不再需要定位參考容器。頁首與側邊欄由 `DesktopLayout` 產生（回傳 fragment，DOM 攤平後落進 grid），圖表則刻意留在佈局切換之外，見 [`responsive.md`](responsive.md)。

`ChartContainer` 以 `autoSize: false` + 自管 `ResizeObserver` 決定尺寸（見 [`docs/drawing.md`](drawing.md) 與 `ChartContainer.tsx`），側邊欄收合不會改變容器尺寸，只有視窗縮放（或跨斷點時 `ChartHandle.resize()`）才會 resize。

### 疊層（z-index）

圖表在側邊欄底下仍是滿版的，其內部元素會延伸到側邊欄下方，**側邊欄必須壓在它們之上才點得到**。順序集中定義在 `web/src/index.css` 的 `:root`：

| 變數 | 值 | 說明 |
|---|---|---|
| `--z-chart-canvas` | 2 | lightweight-charts 的 canvas（函式庫寫死 1/2），**參考用、我方不套用** |
| `--z-chart-pane-handle` | 50 | pane 分隔線拖曳把手（函式庫 `_addResizableHandle` 寫死 49/50），**參考用、我方不套用** |
| `--z-chips` | 55 | `.indicator-legend`（指標圖例與參數小面板，responsive2），須高於 pane 把手、低於側邊欄 |
| `--z-sidebar` | 60 | `.sidebar` 與行動版 `.overlay-panel`，須高於 pane 把手 |
| `--z-dropdown` | 70 | `.chart-toolbar-suggestions`（代號搜尋下拉），須高於側邊欄 |

實際踩過的坑：側邊欄一開始用 `z-index: 1`，圖表 canvas（1/2）整片蓋在側邊欄上，所有點擊都被吃掉；改成 10 之後仍有一條「隱形帶」——pane 分隔線把手（50）橫跨全寬（含側邊欄底下），點在該 y 座標上會誤觸量能 pane 高度拖曳。最終定為 60，並把下拉建議提到 70。**升級 lightweight-charts 時需複查函式庫是否調整了 1/2、49/50 這些內部值。**

## `Sidebar`（`components/sidebar/Sidebar.tsx`）

```tsx
<Sidebar collapsed={boolean} onCollapsedChange={(collapsed: boolean) => void}>
  {children}
</Sidebar>
```

- 折疊狀態由呼叫端持有：`App.tsx` 的 `settingsOpen`，經 `DesktopLayout` 反相後傳入（`collapsed={!settingsOpen}`）。收合時側邊欄寬度 260px → 32px（`transition: width 0.2s ease-out`），只留 `«`／`»` 切換鈕（`aria-expanded` + `aria-label`）。
- 收合時 `children` 整段從 DOM 移除（非 `display: none`），避免隱藏內容仍可被 Tab 聚焦。
- `.sidebar-body` 固定 `width: var(--sidebar-width)`，收合動畫期間內容不重排，只被 `.sidebar` 的 `overflow: hidden` 裁掉。
- 兩個寬度變數 `--sidebar-width: 260px` / `--sidebar-collapsed-width: 32px` 定義在 `index.css` 的 `:root`（responsive2 從 `.sidebar` 移出）：指標圖例要依側邊欄目前寬度往右讓開，兩邊必須共用同一組數字。

## `SidebarSection`（`components/sidebar/SidebarSection.tsx`）

```tsx
<SidebarSection title="指標" collapsed={boolean} onCollapsedChange={fn}>{children}</SidebarSection>
```

- 點頂部標題列（`<button>` + `aria-expanded`，caret ▾/▸）折疊整區，折疊時內容從 DOM 移除。
- **折疊狀態刻意由 `App.tsx` 持有而非元件內部**：折疊「畫線區塊」時必須連帶取消線段選取（見下方選取規則）。

## 資料源區塊（`components/sidebar/DataSourcePanel.tsx`，sidebar2）

```tsx
<DataSourcePanel value={dataSource} onChange={setDataSource} market={symbol.market} />
```

側邊欄頂端**常駐、不可折疊**。radiogroup 兩個選項對應 `DataSource`（見 [`data-layer.md`](data-layer.md)）：

- `Yahoo（快）`（預設）／`官方（TWSE／TPEx）`
- 選「官方」時額外顯示：
  - 路由狀態：`目前路由：證交所（TWSE）（上市）`／`櫃買中心（TPEx）（上櫃）`，label 直接取自 `resolveProvider('official', market)` 回傳的 provider。
  - 市場別未知（代號不在股票清單內）時改顯示警告：`此代號不在股票清單內，官方源無法判斷市場別，請改用 Yahoo`。
  - 等待提示：`官方源為逐月抓取，可能須等待` —— **固定顯示、不分區間長短**（原本依查詢月數判斷的 `estimateSlow` 已移除）。
- **request 節流／限流一律不呈現給使用者**，屬程式內部行為。

## 畫線區塊（`components/sidebar/DrawingListPanel.tsx`，sidebar3）

```tsx
<DrawingListPanel
  lines={lines}                 // DrawnLine[]，來自 ChartContainer 的 onLinesChange
  selectedId={selectedLineId}
  onSelect={(id) => …}          // 只回報被點到的 id，切換規則見 lineSelection
  onDelete={(id) => chartRef.current?.deleteLine(id)}
/>
```

- 區塊標題顯示線數：`畫線（2）`。
- 空清單顯示「尚未畫任何線」；有線時在清單上方顯示一行操作提示「點項目可高亮圖上對應線段，再點一次取消」。
- 每一項＝色塊（該線的 `color`）＋標籤＋刪除鈕。標籤由 `lib/chart/drawing/lineLabel.ts` 的 `formatLineLabel(index)` 產生，**只顯示編號 `#1`、`#2`…**：起訖日期屬內部座標資訊，刻意不揭露。
- 選取項套用 `aria-pressed` 與 accent 高亮；圖上對應線段由 `DrawingController.highlightLine(id)` 加粗（選取時線寬為該線 `width` 的 **2 倍**）並畫出端點把手。
- **僅提供檢視、選取、刪除**，不含畫線開關與改色（畫線模式與選色留在主畫面 header）。刪除是觸控裝置刪除單條線的唯一路徑（畫布點擊選取已於 drawing6 移除）。

### 選取規則（`lib/chart/drawing/lineSelection.ts`）

抽成純函式以便單獨測試，`App.tsx` 只負責把結果套進 state：

| 函式 | 行為 |
|---|---|
| `toggleSelection(prev, id)` | 點同一項再點一次即取消選取 |
| `keepSelection(prev, lines)` | 清單更新後，被刪除／切股清空的線不保留選取 |
| `selectionAfterCollapse(prev, sidebarCollapsed, sectionCollapsed)` | 折疊畫線區塊或整個側邊欄時一律取消選取（圖上高亮同時消失）；responsive2 後呼叫端傳入的是 `!settingsOpen`，行動版收起設定面板等同收合側邊欄 |

## `App.tsx` 的相關狀態

| state | 用途 |
|---|---|
| `settingsOpen` / `indicatorSectionCollapsed` / `drawingSectionCollapsed` | 設定面板開關（桌面側邊欄／行動覆蓋面板共用，responsive2 取代原本的 `sidebarCollapsed`）與兩處區塊折疊狀態 |
| `lines` / `selectedLineId` | 畫線清單快照與目前選取；`lines` 由 `ChartContainer` 的 `onLinesChange` 回填 |
| `chartRef: ChartHandle` | 圖表的指令式介面：`deleteLine(id)`／`addLine()`／`takeScreenshot*()`／`resize()`（見 [`drawing.md`](drawing.md)、[`share.md`](share.md)、[`responsive.md`](responsive.md)） |
| `notice` | 「這次沒查詢、畫面沿用前一次結果」的說明（見 [`data-layer.md`](data-layer.md)），與 `error`（查詢失敗）分開 |

`onLinesChange` 以 `useCallback` 包成穩定身分，否則每次 render 都會重新訂閱 `DrawingController`。

## 手動驗證紀錄

沙盒的 Browser pane 為 hidden 狀態（`document.visibilityState === 'hidden'`），CSS transition 與 rAF 被凍結、canvas 不重繪、lightweight-charts 的 crosshair 事件不觸發，因此驗證分成兩類：

**以 `javascript_tool` 讀 DOM／命中測試驗證（沙盒內完成）**

- 覆蓋式版面：收合／展開／再展開三態下，`.chart-container` 與 `.tv-lightweight-charts` 寬度恆為 1124px、`left` 恆為 1，圖表確實不受側邊欄影響。
- 疊層：`getComputedStyle(sidebar).zIndex === '60'`、下拉 `70`；`document.elementFromPoint` 在收合鈕與面板位置皆命中側邊欄元素，圖表區（x=900）仍命中 `CANVAS`。
- 折疊行為：兩個區塊標題的 `aria-expanded` 正確切換，折疊時內容從 DOM 移除、展開後恢復；指標區塊內新增 MA 後參數（週期／計算來源／線色）與移除鈕都在側邊欄內。
- 資料源區塊：預設 Yahoo；切官方後實打 TWSE 6 次（6 個月逐月）、上櫃代號改走 TPEx proxy、路由文字同步更新；等待提示固定顯示、切回 Yahoo 消失。

**只能人工測（使用者於真實瀏覽器完成）**

- 拖曳畫線後清單即時列出、點選高亮、刪除單條、折疊自動取消選取——皆已由使用者實測確認。
- 使用者回饋並已修正的三項：選取高亮改為線寬 ×2（原本 +1px 太不明顯）、清單標籤移除起訖日期、側邊欄改為覆蓋式不 resize。

## 已知限制 / 尚未實作

- **行動版不使用側邊欄**：`< 1024px` 時設定改由 `OverlayPanel` 覆蓋整個圖表區承載（區塊內容相同），見 [`responsive.md`](responsive.md)。觸控手勢調整（`responsive3`）尚未實作。
- **側邊欄互動沒有元件測試**：折疊、選取、刪除等 React 互動只有抽出的純函式（`lineSelection`、`lineLabel`）有 unit test，元件層仍靠人工驗證，見 [`technical-debt.md`](../project-planning/technical-debt.md)。
- **疊層依賴函式庫內部值**：`--z-sidebar` 必須高於 lightweight-charts 寫死的 49/50，升級函式庫時需複查，見 [`technical-debt.md`](../project-planning/technical-debt.md)。
