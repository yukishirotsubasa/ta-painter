# Task List

> TA Painter：純前端台股歷史資料圖表網站（GitHub Pages）。依模組拆分為可獨立驗證的任務，不採 MVP 分階段。

---

## Suggested Implementation Order

```text
share1 -> share2
data7 -> sidebar1 -> sidebar2
sidebar3 -> responsive1 -> responsive2 -> responsive3
share3 -> share4 -> share5
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
| [data7](task-pool/data7.md) | 等待 | Low | - | 資料源切換：預設 Yahoo（單次快查）／官方源依市場別路由 TWSE/TPEx（逐月抓取）；切官方顯示逐月等待提示（request 限流為程式內部節流，不顯示提示） |

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
| [sidebar1](task-pool/sidebar1.md) | 等待 | High | - | 版面重構「側邊欄 + 圖表」；側邊欄整體可折疊；`IndicatorPanel` 移入成可折疊「指標區塊」；折疊/展開後圖表正確 resize；畫線模式開關留主畫面 |
| [sidebar2](task-pool/sidebar2.md) | 等待 | Medium | data7, symbol2 | 頂端資料源區塊：2 選項 Yahoo（預設）/ 官方（依市場別自動路由 TWSE/TPEx）；切官方顯示逐月等待提示（request 限流為程式內部節流，不顯示提示） |
| [sidebar3](task-pool/sidebar3.md) | 等待 | Medium | drawing6 | 可折疊「畫線區塊」：列出所有畫線、點選高亮對應線、刪除單條（僅檢視+刪除，觸控/桌面通用）；折疊清單或側邊欄時自動取消選取 |

### share Module

URL 分享（狀態序列化）與圖片分享（截圖、剪貼簿、Web Share）。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [share1](task-pool/share1.md) | 等待 | Medium | indicator6, drawing7 | 混合式 `ShareState` 編解碼（指標短代碼+參數後綴省略預設 → lz-string，**無版本欄位**）；unit test round-trip 深度相等、單項損壞捨棄該項其餘照常還原、預設值可補回 |
| [share2](task-pool/share2.md) | 等待 | Medium | share1 | URL hash 還原邏輯，分享連結開新分頁貼上能完整還原畫面；需補 `DrawingController.addLine()` 還原線條；還原時同步 `ChartToolbar` draft |
| [share3](task-pool/share3.md) | 等待 | Low | - | `takeScreenshot(addTopLayer)` 驗證，截圖確認含手繪畫線內容 |
| [share4](task-pool/share4.md) | 等待 | Low | share3 | 桌面剪貼簿複製功能，複製後可貼到其他軟體顯示圖片 |
| [share5](task-pool/share5.md) | 等待 | Low | share3 | 行動裝置 Web Share API + 下載 fallback，手機實測分享到 LINE 成功 |

### responsive Module

RWD／行動裝置適配：斷點佈局、行動版面板、觸控手勢。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [responsive1](task-pool/responsive1.md) | 等待 | Medium | - | `useResponsive` + 斷點佈局骨架，縮放視窗/裝置模擬時佈局正確切換且圖表 resize |
| [responsive2](task-pool/responsive2.md) | 等待 | Medium | responsive1, sidebar1 | 行動版設定 bottom sheet（複用 sidebar 設定區塊）+ 精簡工具列，手機/平板實測操作順暢 |
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
- `../docs/data-layer.md` — 已實作資料層行為（provider registry、TwseProvider、逐月節流查詢、localStorage 快取）
- `../docs/indicators.md` — 已實作指標架構（IndicatorDefinition/registry、MA/布林通道/MACD 指標、指標清單 UI）
- `../docs/stock-list.md` — 已實作股票清單自動更新（來源／解析規則、有效性 gate 與重試、每週 workflow 與 Pages 串接）
- `../docs/drawing.md` — 已實作畫線模組（TrendLinePrimitive、正式 DrawingController：模式切換、按下拖曳、多線陣列管理、切股清除、選取刪除單條線）
- `../docs/symbol-search.md` — 已實作前端代號搜尋（清單載入與快取、代號／名稱搜尋排序、送出前代號解析、ChartToolbar combobox）

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
