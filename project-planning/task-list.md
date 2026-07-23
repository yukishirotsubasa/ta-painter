# Task List

> TA Painter：純前端台股歷史資料圖表網站（GitHub Pages）。依模組拆分為可獨立驗證的任務，不採 MVP 分階段。

---

## Suggested Implementation Order

```text
（無待辦任務）
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
| [data8](task-pool/data8.md) | 完成 | Medium | - | 資料源失效的使用端提示：資料層錯誤分類（`upstream-blocked`/`no-data`/`unknown`），只在上游被擋／掛掉時於錯誤訊息下方追加「請聯絡製作者」文案（純文字不附連結）。取代原 ci3 的 cron 健康檢查方向 |

### chart Module

圖表渲染核心：K 線、量能子 pane、股票代號切換、配色主題。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [chart4](task-pool/chart4.md) | 完成 | Medium | - | 整站固定 dark 主題：`index.css` 移除 `prefers-color-scheme` light 分支、`color-scheme: dark`；圖表 `layout.textColor`/`grid` 色改引用 `colors.ts` 新增的 `CHART_TEXT_COLOR`/`CHART_GRID_COLOR`；`index.html` 加 `theme-color`。不做主題切換 UI |

### symbol Module

股票清單與代號搜尋：每週更新清單、代號/名稱搜尋建議。（本模組任務皆已完成。）

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|

### indicator Module

技術指標可擴充架構：參數型別化、來源/顏色可調、共用常數與 reconcile 效率。（本模組任務皆已完成。）

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [indicator9](task-pool/indicator9.md) | 完成 | Low | - | 指標共用常數單一來源：新增 `lib/chart/panes.ts`（`PRICE_PANE_INDEX`/`VOLUME_PANE_INDEX`/`RESERVED_PANE_COUNT`）供 `ChartContainer` 與 `ma.ts` 共用；`ma.ts` 的 `DEFAULT_COLOR` 改 import `colors.ts` 的 `DEFAULT_LINE_COLOR`。純重構 |
| [indicator10](task-pool/indicator10.md) | 完成 | Low | indicator9 | separate-pane index 改由 `chart.panes()` 實際查詢決定，allocator 不再自維計數器；測試改用 fake `chart` 涵蓋「移除中間 pane」情境 |
| [indicator11](task-pool/indicator11.md) | 完成 | Low | indicator9 | 指標 reconcile 加變更偵測：記下上次套用的 `params`/`data` 參考，只對實際變動的實例呼叫 `update()` |

### drawing Module

使用者手動畫直線：線清單曝光、顏色可調。（本模組任務皆已完成。）

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|

### sidebar Module

可折疊設定側邊欄：資料源、指標、已畫線的整合設定面板。（本模組任務皆已完成。）

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|

### share Module

URL 分享（狀態序列化）與圖片分享（截圖、剪貼簿、Web Share）。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [share6](task-pool/share6.md) | 完成 | Medium | - | 分享連結的線條還原綁定股票代號：`pendingLinesRef` 改存 `{ stockNo, lines }`，還原前比對不符即丟棄，修掉「首查失敗後線條被畫到別支股票」的 bug 與 hash 同步被卡住的副作用 |

### responsive Module

RWD／行動裝置適配：斷點佈局、行動版面板、觸控手勢。（本模組任務皆已完成。）

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|

### Maintenance / Other

跨模組維護：CI 型別/測試 gate。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [ci1](task-pool/ci1.md) | 完成 | High | - | web 型別檢查 gate：版本控管的 `.githooks/pre-push`（`core.hooksPath`，零 npm 依賴），本次 push 動到 `web/` 才跑 `npm run typecheck`（新增之 script = `tsc -b`）；不走 husky／分支 CI（實作流程僅在 main） |
| [ci2](task-pool/ci2.md) | 完成 | Low | - | worker CI 測試 gate：監聽 `worker/**` 跑 `deno task test`/`deno check` |

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
