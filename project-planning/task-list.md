# Task List

> TA Painter：純前端台股歷史資料圖表網站（GitHub Pages）。依模組拆分為可獨立驗證的任務，不採 MVP 分階段。

---

## Suggested Implementation Order

```text
responsive3
ci1 -> ci2 -> ci3
```

---

## Modules / Tasks

### infra Module

部署與 CORS 代理基礎設施：GitHub Pages 部署流程、CORS proxy（Deno Deploy）。（本模組任務皆已完成。）

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|

### data Module

資料層：TWSE 直連、TPEx/Yahoo 經 Worker proxy，含快取與節流。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [data7](task-pool/data7.md) | 完成 | Low | - | 資料源切換：預設 Yahoo（單次快查）／官方源依市場別路由 TWSE/TPEx（逐月抓取）；官方源固定顯示逐月等待提示（不分區間長短，`estimateSlow` 已移除）；request 限流為程式內部行為（代號送出 300ms debounce），不顯示提示 |

### chart Module

圖表渲染核心：K 線、量能子 pane、股票代號切換。（本模組任務皆已完成。）

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|

### symbol Module

股票清單與代號搜尋：每週更新清單、代號/名稱搜尋建議。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [symbol1](task-pool/symbol1.md) | 完成 | Medium | - | 每週 cron GitHub Actions 抓 TWSE 上市（ISIN，分類白名單）+ TPEx 上櫃（MOPS CSV），輸出 `web/public/stock-list.json` 並 commit 回 repo（server 端抓取，無 CORS）；已實跑產出 2205 檔 |
| [symbol2](task-pool/symbol2.md) | 完成 | Medium | symbol1 | `ChartToolbar` 載入清單，代號或名稱模糊搜尋 + 下拉建議 + 鍵盤選取，帶入代號與市場別；順帶修 `ChartToolbar` 不同步 `stockNo` 技術債 |

### indicator Module

技術指標可擴充架構：參數型別化、來源/顏色可調。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [indicator6](task-pool/indicator6.md) | 完成 | High | - | 參數 schema 型別化（`type: number\|enum\|color`），`IndicatorParamValues` 改 `Record<string,number\|string>`，`IndicatorPanel` 依型別渲染 number/select/color；不改既有指標行為 |
| [indicator7](task-pool/indicator7.md) | 完成 | Medium | indicator6 | MA 加 `source`（close/open/high/low/volume，可對 volume 計算）與 `color`，`computeMa` 依 source 取值、mount 讀色 |
| [indicator8](task-pool/indicator8.md) | 完成 | Low | indicator6 | 布林/MACD/量能柱顏色可調；抽出共用 `lib/chart/colors.ts`，`ChartContainer` 與 `macd.ts` 共用同一份 |

### drawing Module

使用者手動畫直線：線清單曝光、顏色可調。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [drawing6](task-pool/drawing6.md) | 完成 | Medium | - | `DrawingController` 加穩定 id 並曝光 `getLines()`/`onLinesChange`/`deleteLine(id)` 給 React；移除畫布點擊選取（hitTest/選取/鍵盤刪除），選取刪除改由側邊欄清單 |
| [drawing7](task-pool/drawing7.md) | 完成 | Medium | drawing6 | 線資料加 `color`（可調）/`width`（僅入結構暫不開 UI），renderer 讀取；主畫面畫線工具列提供選色 UI |

### sidebar Module

可折疊設定側邊欄：資料源、指標、已畫線的整合設定面板。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [sidebar1](task-pool/sidebar1.md) | 完成 | High | - | 版面重構「側邊欄 + 圖表」；側邊欄整體可折疊；`IndicatorPanel` 移入成可折疊「指標區塊」；畫線模式開關留主畫面。**實作時依人工驗證改為覆蓋式**：側邊欄絕對定位蓋在圖表上，收合/展開不改變圖表尺寸、不觸發 resize |
| [sidebar2](task-pool/sidebar2.md) | 完成 | Medium | data7, symbol2 | 頂端資料源區塊：2 選項 Yahoo（預設）/ 官方（依市場別自動路由 TWSE/TPEx）；官方源固定顯示逐月等待提示、市場別未知時顯示警告且不清空既有資料（request 限流為程式內部節流，不顯示提示） |
| [sidebar3](task-pool/sidebar3.md) | 完成 | Medium | drawing6 | 可折疊「畫線區塊」：列出所有畫線、點選高亮對應線、刪除單條（僅檢視+刪除，觸控/桌面通用）；折疊清單或側邊欄時自動取消選取 |

### share Module

URL 分享（狀態序列化）與圖片分享（截圖、剪貼簿、Web Share）。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [share1](task-pool/share1.md) | 完成 | Medium | indicator6, drawing7 | 混合式 `ShareState` 編解碼（指標短代碼+參數後綴省略預設 → lz-string，**無版本欄位**）；unit test round-trip 深度相等、單項損壞捨棄該項其餘照常還原、預設值可補回。**實作時分隔符改用 `~` 而非任務書的 `.`**：週期／標準差倍數／價格皆可能是浮點數，`.` 會與小數點衝突 |
| [share2](task-pool/share2.md) | 完成 | Medium | share1 | URL hash 還原（`#s=`）：掛載時讀 hash 還原代號／資料源／區間／指標，資料到齊後以新增的 `DrawingController.addLine()` 重建線條；狀態變動以 `replaceState` 同步 hash；「分享URL」鈕（share5 後與「複製圖片」「分享圖片」並列，原名「分享」語意不明故改名）複製目前網址；hash 壞掉顯示提示並照常載入。`ChartToolbar` draft 同步已於 symbol2 完成，本任務未再改動 |
| [share3](task-pool/share3.md) | 完成 | Low | - | `lib/chart/screenshot.ts`（截圖→補底色→PNG blob）＋ `ChartHandle.takeScreenshot()`。**驗證結論**：手繪線的 pane view 是預設 `zOrder:'normal'`、畫在主畫布，`takeScreenshot` 必定截入，**不需 offscreen 疊繪備案**；`addTopLayer` 只多疊 top 畫布（準星／`zOrder:'top'`），`includeCrosshair:false` 無殘影。**額外**：`layout.background` 是 transparent，截圖預設以 `destination-over` 補頁面 `--bg`，避免貼到其他軟體變黑底 |
| [share4](task-pool/share4.md) | 完成 | Low | share3 | `lib/share/imageShare.ts`（能力偵測／剪貼簿／下載／檔名，與 `screenshot.ts` 分層）＋ `ShareMenu`（包住 `ShareLinkButton` 再加「複製圖片」）。**不 await 截圖**：`ClipboardItem` 直接吃 `Promise<Blob>`，click handler 內同步 `write()` 以保住 user activation；API 不存在或 write 被拒都退回下載（沿用同一個截圖，不重截）。貼到其他軟體已人工實測正確 |
| [share5](task-pool/share5.md) | 完成 | Low | share3 | `ShareMenu` 加「分享圖片」：`canShare({files})` 拿真 `File` 問過才走 `share()`，不支援／被拒退回下載，**使用者取消（`AbortError`）不算失敗也不下載**。為此新增**同步截圖路徑** `takeChartScreenshotBlobSync()`（`toDataURL` + 自解 base64）：`share()` 不吃 promise 且對 user activation 嚴格，需全程同步；剪貼簿仍走非同步版。**真機（iOS/Android 分享到 LINE）待實測** |

### responsive Module

RWD／行動裝置適配：斷點佈局、行動版面板、觸控手勢。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [responsive1](task-pool/responsive1.md) | 完成 | Medium | - | `useResponsive`（`useSyncExternalStore` + `matchMedia`，`>=1024px` 桌面）+ `DesktopLayout`／`MobileLayout` 骨架。**實作時圖表刻意留在切換之外**：兩個 Layout 只回傳 chrome（頁首 + 設定面板），`<main>` + `ChartContainer` 固定掛在 `.app` 上，否則跨斷點時 React 會卸載圖表、連 pan/zoom 與手繪線一起重建；版面改用 `.app` 兩列 grid（row 2 圖表與設定面板同格重疊）取代原本的 `.app-body` + 絕對定位。新增 `ChartHandle.resize()`，斷點變動時由 `useLayoutEffect` 主動呼叫（ResizeObserver 晚一幀會先閃舊尺寸） |
| [responsive2](task-pool/responsive2.md) | 完成 | Medium | responsive1, sidebar1 | 行動版設定改用 `OverlayPanel`（**實測回饋後由貼底 bottom sheet 改為覆蓋整個圖表區**：貼底版面板太矮不好操作；仍是 grid row 2 的覆蓋層，不擠壓圖表尺寸、關閉即還原）承載原本的側邊欄設定區塊。`IndicatorLegend`＝chip 列＋點擊在正下方展開的參數小面板，**依回饋改為桌面／行動共用**（由 App 直接掛在 `.app` 上，與圖表一樣不參與佈局切換；容器 `pointer-events:none` 只讓 chip 與面板吃事件，桌面版另依側邊欄寬度讓開）。從 `IndicatorPanel` 抽出 `IndicatorParamFields` 給三處共用，chip 文字／色點為純函式 `chipLabel.ts`（簡稱取自標籤全形括號，例 `MA(60)`、`MACD(12,26,9)`）。App 的 `sidebarCollapsed` 改為 `settingsOpen`（桌面側邊欄與行動面板共用一個狀態，sidebar3 取消選取規則沿用），切到行動版自動收起。精簡工具列以 `compact` prop 實作：標題與欄位說明改 `sr-only`（不用 `display:none`，保留無障礙樹）、按鈕文字縮短、**行動版拿掉「複製圖片」**（改走系統分享面板）。畫線工具列**依回饋改為 `fieldset`/`legend` 群組**：外框＋「畫線」標題把模式開關與選色框成一組，色塊旁加一段用目前顏色畫的 SVG 線段預覽，畫線模式開啟時整組高亮 |
| [responsive3](task-pool/responsive3.md) | 等待 | Medium | responsive1 | 觸控畫線手勢最終調整，真機測試畫線與 pan/zoom 切換無衝突 |

### Maintenance / Other

跨模組維護：CI 型別/測試 gate、上游 proxy 健康檢查。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [ci1](task-pool/ci1.md) | 等待 | Low | - | web 型別檢查 gate：husky pre-commit 或非-main 分支 CI 跑 `tsc -b`/`npm run build` |
| [ci2](task-pool/ci2.md) | 等待 | Low | - | worker CI 測試 gate：監聽 `worker/**` 跑 `deno task test`/`deno check` |
| [ci3](task-pool/ci3.md) | 等待 | Low | - | proxy 健康檢查排程：cron curl TPEx/Yahoo proxy 端點，失敗告警 |

---

## Planning Files

- `design.md` — 專案整體設計文件（Context/技術棧/目錄結構/核心模組設計/待驗證項目，屬**規劃**文件，不代表目前已實作狀態）
- `technical-debt.md` — 已知技術債清單
- `../docs/deployment.md` — 實際部署設定（GitHub Pages workflow、本機開發指令）
- `../docs/proxy.md` — 已實作 CORS proxy（`worker/`，Deno Deploy，`/proxy/{tpex|yahoo}?path=...`）
- `../docs/data-layer.md` — 已實作資料層行為（provider registry、三個 provider、資料源路由與 App 查詢流程、逐月節流查詢、localStorage 快取）
- `../docs/sidebar.md` — 已實作設定側邊欄（覆蓋式版面與疊層順序、可折疊骨架、資料源區塊、畫線清單與選取規則）
- `../docs/responsive.md` — 已實作 RWD 佈局（`useResponsive` 斷點、`.app` 兩列 grid 與「圖表不參與佈局切換」、桌面／行動 chrome、行動版設定覆蓋面板、指標圖例 chip 與參數小面板、精簡工具列）
- `../docs/indicators.md` — 已實作指標架構（IndicatorDefinition/registry、MA/布林通道/MACD 指標、指標清單 UI）
- `../docs/stock-list.md` — 已實作股票清單自動更新（來源／解析規則、有效性 gate 與重試、每週 workflow 與 Pages 串接）
- `../docs/drawing.md` — 已實作畫線模組（TrendLinePrimitive、正式 DrawingController：模式切換、按下拖曳、多線陣列管理、切股清除、清單 API 與 `ChartHandle`）
- `../docs/symbol-search.md` — 已實作前端代號搜尋（清單載入與快取、代號／名稱搜尋排序、送出前代號解析、ChartToolbar combobox）
- `../docs/share.md` — 已實作分享（URL：ShareState schema、混合式精簡編碼格式、hash 讀寫與 App 還原順序；圖片：截圖與底色補償、剪貼簿／Web Share／下載三條輸出路徑與 user activation 處理；分享列三顆按鈕）

---

## Module Dependencies

- infra -> data
- data -> chart
- chart -> symbol
- chart -> indicator
- chart -> drawing
- chart -> sidebar
- data -> sidebar
- symbol -> sidebar
- indicator -> sidebar
- drawing -> sidebar
- indicator -> share
- drawing -> share
- sidebar -> responsive
- indicator -> responsive
- drawing -> responsive
