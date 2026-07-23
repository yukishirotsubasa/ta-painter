# RWD 佈局（`web/src/hooks/useResponsive.ts`、`components/layout/`）

> 本文件記錄**已實作**的響應式佈局：斷點 hook 與桌面／行動佈局骨架（responsive1）+ 行動版設定覆蓋面板、指標圖例與精簡工具列（responsive2）+ 觸控手勢與觸控目標尺寸（responsive3）。整體規劃見 `project-planning/design.md`。

## 斷點（`hooks/useResponsive.ts`）

```ts
export const DESKTOP_MIN_WIDTH = 1024;
export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';
export type Breakpoint = 'desktop' | 'mobile';

readBreakpoint(): Breakpoint            // 目前斷點（getSnapshot）
subscribeBreakpoint(onChange): () => void
useResponsive(): Breakpoint             // useSyncExternalStore(subscribe, read)
```

- `>= 1024px` 為 `desktop`，其餘為 `mobile`（含平板直向）。
- 回傳**字串**而非物件：`useSyncExternalStore` 要求 snapshot 在未變動時參考相等，物件每次都會是新的。
- `window.matchMedia` 不存在（非瀏覽器環境）時 `readBreakpoint()` 回 `desktop`、`subscribeBreakpoint()` 回可安全呼叫的空 unsubscribe，兩者都不丟例外。
- 單元測試（node 環境，`vi.stubGlobal('window', …)` 假 MQL）涵蓋：命中／未命中、查詢字串由 `DESKTOP_MIN_WIDTH` 組出、無 `matchMedia` 的回退、listener 註冊與解除。

## 版面：`.app` 兩列 grid

```tsx
<div className={`app app-${breakpoint}${settingsOpen ? ' app-settings-open' : ''}`}>
  {breakpoint === 'desktop' ? <DesktopLayout … /> : <MobileLayout … />}
  <IndicatorLegend … />                {/* row 2，覆蓋在圖表左上 */}
  <main className="app-main">          {/* row 2，恆為滿版 */}
    <ChartContainer … />
  </main>
</div>
```

```css
.app {
  display: grid;
  grid-template-rows: auto 1fr;   /* row 1 頁首（高度依內容）／row 2 圖表 */
  grid-template-columns: 1fr;
  height: 100vh;
  height: 100dvh;                 /* 行動瀏覽器網址列展開/收起時不溢出 */
}
```

- **row 2 是一格多層**：`.app-main`（圖表）、`.sidebar`／`.overlay-panel`（設定）、`.indicator-legend`（圖例）都放在 `grid-row: 2; grid-column: 1`，靠 `z-index` 疊起來。因此所有覆蓋層都**不擠壓圖表尺寸**，關閉後圖表原樣露出、不需要 resize。
- 頁首與設定面板由 `DesktopLayout`／`MobileLayout` 產生（兩者都回傳 fragment，不含容器），DOM 攤平後直接落進上面的 grid 格子。

### 圖表刻意留在佈局切換之外

`<main class="app-main">` 與 `<ChartContainer>` 是 `.app` 的固定子節點，**不放進兩個 Layout 元件裡**。原因：跨斷點時 React 會卸載舊 Layout 的整棵子樹，`ChartContainer` 一旦重建，`IChartApi`、`DrawingController` 與其中的 pan/zoom 位置、手繪線全部跟著重來（iPad 直↔橫向旋轉就會跨越 1024px，是實際會踩到的路徑）。代價是兩個 Layout 只能排 chrome，不能自由決定圖表在 DOM 中的位置——目前兩個斷點的圖表都是「填滿頁首以下」，這個限制不構成問題。

`IndicatorLegend` 基於同樣理由也掛在 `.app` 上（兩個斷點共用同一份圖例，切換時不重建）。

### 佈局切換時主動 resize

```ts
useLayoutEffect(() => {
  chartRef.current?.resize();   // ChartHandle.resize()：依容器 clientWidth/Height 呼叫 chart.resize()
}, [breakpoint]);
```

切換佈局會改變頁首高度 → row 2 高度跟著變。`ChartContainer` 自管的 `ResizeObserver` 要等下一幀才回呼，中間會先閃一次舊尺寸，因此在 DOM 更新後、瀏覽器繪製前主動 resize 一次。首次掛載時圖表尚未建立，`resize()` 是安全的 no-op。

### 疊層

沿用 `web/src/index.css` `:root` 的順序表（完整表格見 [`sidebar.md`](sidebar.md)），responsive2 新增一層：

| 變數 | 值 | 說明 |
|---|---|---|
| `--z-chips` | 55 | `.indicator-legend`（圖例 chip 列與參數小面板）：須高於 lightweight-charts 的 pane 分隔線把手（49/50）才點得到，低於側邊欄／設定面板 |
| `--z-sidebar` | 60 | `.sidebar` 與 `.overlay-panel` |

## `DesktopLayout` / `MobileLayout`（`components/layout/`）

```tsx
interface AppLayoutProps {
  header: ReactNode;      // 標題、代號查詢／畫線／分享工具列、進度條、notice
  settings: ReactNode;    // 設定區塊內容（DataSourcePanel + 兩個 SidebarSection），不含容器
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
}
```

| | 桌面版 | 行動平板版 |
|---|---|---|
| 頁首 | `.app-header` 橫向一列 | `.app-header .app-header-mobile`：`flex-wrap` 換行、縮小留白，右側多一顆「設定」鈕（`aria-expanded`，`margin-left: auto`） |
| 設定容器 | `<Sidebar collapsed={!settingsOpen}>`（覆蓋左側 260px，見 [`sidebar.md`](sidebar.md)） | `<OverlayPanel title="設定">`（覆蓋整個圖表區） |
| 工具列 | 完整文字 | `compact`（見下方） |

`settings` 內容由 `App.tsx` 產生、兩邊共用同一份節點，兩個 Layout 只決定外層容器。

## `OverlayPanel`（`components/layout/OverlayPanel.tsx`）

行動版設定面板：佔滿 `.app` grid 的 row 2（`grid-row: 2; grid-column: 1`），標題列（`<h2>` + `✕` 關閉鈕，觸控目標 44px）＋可捲動的 body（`overscroll-behavior: contain`，底部 `padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px))` 避開 iPhone home indicator）。開關由呼叫端決定——**不渲染即關閉**，沒有 `open` prop。

> **實測回饋後的修正**：原本做成貼底的 bottom sheet（`max-height: 60%`），使用者實測回報面板太矮、選項擠在一起不好操作，改為整區覆蓋。同一台 390×844 裝置上可操作高度由 334px → 697px。

## 指標圖例（`components/chart/IndicatorLegend.tsx` + `IndicatorChips.tsx`）

```tsx
<IndicatorLegend
  instances={indicators}
  onParamsChange={updateIndicatorParams}
  onRemove={removeIndicator}
  settingsOpen={settingsOpen}
/>
```

- **桌面／行動共用同一份**（實測回饋後的調整：原本只做在行動版，使用者要求桌面也能用同樣格式）。由 `App.tsx` 直接渲染，不歸任一 Layout 管。
- chip 列橫向可捲（`overflow-x: auto`、隱藏捲動條），點 chip 在**正下方**展開該指標的參數小面板；再點同一個 chip 或面板的 `✕` 收起。
- 沒有任何指標時整組不渲染。
- 容器 `pointer-events: none`、只有 chip 與小面板 `pointer-events: auto`：圖例以外的區域事件照樣穿透回圖表，不影響 pan/zoom。
- 桌面版整組往右讓開側邊欄寬度，避免前幾個 chip 被蓋住：`padding-left` 依 `.app-settings-open` 在 `calc(var(--sidebar-width) + 8px)`（268px）與 `calc(var(--sidebar-collapsed-width) + 8px)`（40px）之間切換。兩個寬度變數定義在 `index.css` 的 `:root`，與 `Sidebar.css` 共用同一組數字。
- 展開哪個 chip 是純畫面狀態，留在 `IndicatorLegend` 內部；設定面板展開時（`settingsOpen`）自動收起小面板。指標若在小面板開著時被移除，`instances.find()` 查不到即等同關閉，不需另外清狀態。

### chip 文字與色點（`lib/chart/indicators/chipLabel.ts`）

純函式，單元測試涵蓋（無 DOM）：

| 函式 | 行為 |
|---|---|
| `indicatorShortLabel(label)` | 取全形括號內的簡稱：`移動平均線（MA）` → `MA`；沒有括號時用原標籤（`MACD`） |
| `indicatorChipLabel(definition, params)` | 簡稱 + **數值參數**：`MA(60)`、`MACD(12,26,9)`、`Bollinger Bands(20,2)`。缺值時用 schema 的 `default`；`enum`／`color` 參數不入 chip（放不下，展開面板才看得到） |
| `indicatorChipColor(definition, params)` | 第一個 `type: 'color'` 參數的目前值（未設定時回 schema 預設）；指標沒有顏色參數時回 `null`，chip 不畫色點 |

參數欄位本身用 `IndicatorParamFields`，與側邊欄的 `IndicatorPanel` 共用同一份渲染（見 [`indicators.md`](indicators.md)）。

## 精簡工具列（`compact` prop）

`App.tsx` 依 `breakpoint === 'mobile'` 把 `compact` 下傳給三個工具列元件：

| 元件 | 桌面 | `compact` |
|---|---|---|
| `<h1>`（App 直接渲染） | 「TA Painter」 | 加 `.sr-only` |
| `ChartToolbar` | 「股票代號」label | label 加 `.sr-only`（輸入框仍保有 accessible name） |
| `DrawingToolbar` | 「模式：開/關」＋「線色」文字 | 「畫線」／開啟中「畫線中」（`aria-label="畫線模式"`）＋「線色」文字改 `.sr-only`，色塊與線段預覽保留 |
| `ShareMenu` | 分享URL／複製圖片／分享圖片 | 連結（`aria-label="分享URL"`）／分享圖，**不顯示「複製圖片」** |

- 隱藏一律用 `.sr-only`（`index.css` 的共用類別：1px + `clip-path: inset(50%)`）而非 `display: none`，保留在無障礙樹裡。
- 行動版拿掉「複製圖片」是刻意的：手機要把圖貼到別的 App，走系統分享面板（`navigator.share`）比剪貼簿直接，且橫向空間有限。見 [`share.md`](share.md)。

## 觸控手勢與觸控目標（responsive3）

### 畫線 vs. pan/zoom

畫線模式的手勢互斥本身由 `DrawingController` 負責（`handleScroll`/`handleScale` 關閉、多指一律不畫線），細節見 [`drawing.md`](drawing.md#觸控只認單指responsive3)。responsive 這邊只有兩件事：

- `.chart-container-drawing`（`ChartContainer.css`）在畫線模式加 `touch-action: none` + `user-select: none` + `-webkit-touch-callout: none`，擋掉瀏覽器層級的捲動／雙擊縮放與 iOS 長按選取。非畫線模式不設，原生 pan/zoom 照舊。
- **模式提示只做在工具列**：行動版按鈕開啟時文字為「畫線中」，`aria-pressed='true'` 由淡底改**實心** accent。曾評估在圖表加外框＋角落浮標，使用者選擇不加畫面元素。

### 觸控目標 ≥44px（WCAG 2.5.5 / Apple HIG）

行動版所有可點元素至少 44px 高，做法是**三個既有的斷點 class 後代選擇器**，不另外抄一份斷點數字（斷點常數已在 JS/CSS 各寫一份，見下方已知限制）：

| 選擇器 | 涵蓋 |
|---|---|
| `.app-header-mobile button, input, .drawing-toolbar-color-label`（`AppLayout.css`） | 行動版頁首：查詢／畫線／連結／分享圖／設定、代號輸入框、選色塊（另設 `width: 44px`）、代號下拉每一列（`.chart-toolbar-suggestion`） |
| `.overlay-panel-body button, select, input:not([type='radio']), .data-source-option`（`OverlayPanel.css`） | 設定面板全部控制項；`button` 另加 `min-width: 44px`（「移除」「✕」這類短字按鈕橫向也要夠寬） |
| `.app-mobile .indicator-legend button, select, input`（`IndicatorLegend.css`） | 圖例 chip 與參數小面板（此元件桌面／行動共用同一份節點，故須用 `.app-mobile` 限定） |

兩個實作細節：

- **`input` 必須一併設 `box-sizing: border-box`**：`input` 預設 `content-box`，`min-height: 44px` 會再疊上 padding 與框線變成 53px（`button` 的 UA 預設是 `border-box`，不受影響）。
- **`input[type='radio']` 排除**：拉高替換元素會把圓鈕本身撐大，改讓外層 `.data-source-option` label（整列 44px、滿寬）提供可點面積。

桌面版完全不受影響（三個選擇器都掛在只有行動版才出現的 class 下）。

## `App.tsx` 的相關狀態

| state | 說明 |
|---|---|
| `breakpoint` | `useResponsive()`；同時用於 `compact`、Layout 選擇、`.app` 的 class |
| `settingsOpen` | 桌面版＝側邊欄展開、行動版＝設定面板開啟，**同一個 state**。初始值 `breakpoint === 'desktop'`（行動版預設收合）；`useEffect` 在切到 `mobile` 時強制關閉，反向不自動展開 |

`settingsOpen` 取代了原本的 `sidebarCollapsed`，sidebar3 的取消選取規則改寫成 `selectionAfterCollapse(prev, !settingsOpen, drawingSectionCollapsed)`，行為不變（收起設定面板＝原本的收合側邊欄）。

## 手動驗證紀錄

沙盒的 Browser pane 為 hidden（`document.visibilityState === 'hidden'`），**rendering steps 完全凍結**：`requestAnimationFrame` 不觸發，連帶 `ResizeObserver` 回呼、`matchMedia` 的 `change` 事件、CSS transition 都不會推進（實測 `resize_window` 後 CSS media query 已套用、`matchMedia().matches` 也已翻轉，但 React 收不到 change 事件；側邊欄收合後 `getComputedStyle().width` 卡在 260px，暫時關掉 transition 才量得到終值 32px）。因此驗證改成「調整視窗後重新載入頁面，量測初始渲染」＋「以程式化 `click()` 驅動互動後讀 DOM」。

**桌面 1280×800**

- `app app-desktop`；頁首完整文字（查詢／模式：關／分享URL／複製圖片／分享圖片），`<h1>` 無 `.sr-only`。
- 側邊欄展開時 `.indicator-legend` `padding-left: 268px`、chip 起點 x=268.6（避開 260px 側邊欄）；收合後為 40px／x=40.6。
- 點 chip 開出 MACD 參數小面板（5 個欄位，781×95），位置在 chips 正下方；圖表容器全程 1125×721 不變。
- 1024×768（斷點邊界）判為 `desktop`，圖表 1022×710 貼齊容器 1023×709（1px 為 lightweight-charts 的取整）。

**行動 390×844**

- `app app-mobile`；工具列只剩「查詢／畫線／連結／分享圖／設定」，`<h1>` 為 `.sr-only`；預設無設定面板，圖表 389×751 佔滿 row 2。
- 點「設定」開出 `overlay-panel` 388.9×731.7＝`.app-main` 完全等大，body 可捲高度 697px，資料源／指標／畫線三區塊齊全；圖表容器仍 389×751。
- 從設定面板新增 MA＋布林 → 關閉 → chips 出現在圖表頂端（`padding-left: 8px`，無側邊欄讓位），點 chip 開出布林 5 欄位小面板（372.9×127.5）。
- 5 個 chips 時 `scrollWidth 641 > clientWidth 389`、`scrollLeft = 250` 生效（橫向可捲）。
- 互斥：小面板開著時點「設定」→ 只剩一個面板、所有 chip 的 `aria-pressed` 回 false。
- 從小面板按「移除」→ 指標與 chip 一起消失、面板自動關閉。
- 改 MA 週期 20 → 60，chip 文字即時變成 `MA(60)`。

**responsive3（390×844 量測 DOM，同上以程式化 `click()` 驅動）**

- 頁首 7 個控制項（代號輸入、查詢、畫線、選色塊、連結、分享圖、設定）全部 44px 高，選色塊 44×44。
- 設定面板：`✕` 44×44、資料源兩個 label 各 44×356.9（radio 本身仍 13px，靠 label 提供面積）、三個「+ 指標」鈕與兩個區塊標題 44、指標參數 number 欄位 44×56、色塊 44×44、「移除」44×44。
- 圖例：chip 44×123.9；chip 小面板的 `✕`、5 個參數欄位、「移除」全部 44。
- 畫線模式開啟後 `.chart-container` 加上 `chart-container-drawing`，computed `touch-action: none`、`user-select: none`；按鈕文字「畫線中」、`aria-pressed="true"`、背景 `rgb(192,132,252)`（實心 accent）/ 文字 `rgb(22,23,29)`。
- 桌面 1280×800 重新載入回測：頁首控制項仍為 35.2px、選色塊 22px（三個選擇器都沒外溢），無 console error。
- 多指手勢改用單元測試覆蓋（fake `TouchEvent`），沙盒無法產生真實觸控事件序列；`webkitTouchCallout` 在桌面 Chrome 讀不到（iOS 專屬屬性）。

**只能人工測（尚未執行）**

- 拖曳視窗跨越 1024px 的**即時**切換、DevTools 裝置模擬旋轉（沙盒收不到 `matchMedia` change 事件）。
- 真機（iOS Safari / Android Chrome）觸控操作手感：非畫線模式單指平移＋雙指縮放、畫線模式單指拖曳畫線不誤觸平移、模式提示是否足夠明顯（responsive3 驗收條件 1–3）。

## 已知限制 / 尚未實作

- **佈局切換的即時性未在沙盒驗證**：斷點事件與 ResizeObserver 在 hidden pane 不觸發，只驗證過「以該尺寸重新載入」的結果，見 [`technical-debt.md`](../project-planning/technical-debt.md)。
- **斷點常數在 JS 與 CSS 各寫一份**，且邊界重疊（`index.css` 的 `@media (max-width: 1024px)` 與 `useResponsive` 的 `min-width: 1024px` 在**正好 1024px** 時會同時成立），見 [`technical-debt.md`](../project-planning/technical-debt.md)。
- **設定面板沒有 Esc 關閉與焦點管理**（刻意做成非模態，見 [`technical-debt.md`](../project-planning/technical-debt.md)）。
- **觸控手勢與 44px 觸控目標已實作（responsive3），但只有沙盒 DOM 量測與單元測試背書**：真機（iOS Safari / Android Chrome）的手感驗收尚未執行，見 [`technical-debt.md`](../project-planning/technical-debt.md)。
- 圖表本身的配色仍寫死、不跟隨 light/dark 主題（既有技術債，responsive 模組未處理）。
