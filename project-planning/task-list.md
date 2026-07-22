# Task List

> TA Painter：純前端台股歷史資料圖表網站（GitHub Pages）。依模組拆分為可獨立驗證的任務，不採 MVP 分階段。

---

## Suggested Implementation Order

```text
chart3 -> drawing3 -> drawing4 -> drawing5
chart3 -> responsive1 -> responsive2
responsive1 -> responsive3
infra2 -> data5
infra2 -> data6 -> data7
share1 -> share2
share3 -> share4
share3 -> share5
```

---

## Modules / Tasks

### infra Module

部署與 CORS 代理基礎設施：GitHub Pages 部署流程、Cloudflare Worker proxy。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [infra2](task-pool/infra2.md) | 等待 | Medium | - | Cloudflare Worker CORS proxy 部署完成，`curl` 帶 Origin header 打 `/proxy/tpex`、`/proxy/yahoo` 均回應正確資料且含 CORS header |

### data Module

資料層：TWSE 直連、TPEx/Yahoo 經 Worker proxy，含快取與節流。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [data4](task-pool/data4.md) | 完成 | Medium | data3 | localStorage 快取（月粒度＋LRU），同區間重查時 Network 面板顯示無重複請求 |
| [data5](task-pool/data5.md) | 等待 | Medium | infra2, data1 | `TpexProvider`（走 Worker proxy），查詢上櫃代號取得正確資料 |
| [data6](task-pool/data6.md) | 等待 | Medium | infra2, data1 | `YahooProvider`（走 Worker proxy），長區間一次查詢成功回傳完整資料 |
| [data7](task-pool/data7.md) | 等待 | Low | data3, data6 | 自動選源／長區間切源提示 UI，觸發長區間查詢時顯示等待提示或一鍵切換 Yahoo |

### chart Module

圖表渲染核心：K 線、量能子 pane、股票代號切換。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [chart3](task-pool/chart3.md) | 等待 | High | chart2 | `ChartToolbar` 股票代號輸入/切換，輸入不同代號能正確換圖 |

### indicator Module

技術指標可擴充架構：MA、布林通道、MACD 與指標清單 UI。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [indicator1](task-pool/indicator1.md) | 完成 | High | chart1 | `IndicatorDefinition` 介面 + registry 架構，unit test 驗證 `compute()` 純函式輸出正確 |
| [indicator2](task-pool/indicator2.md) | 完成 | High | indicator1 | MA 指標（overlay + 參數面板），畫面疊加 MA 線且數值比對正確，調參即時更新 |
| [indicator3](task-pool/indicator3.md) | 完成 | Medium | indicator1 | 布林通道指標，三條線正確疊加且數值正確 |
| [indicator4](task-pool/indicator4.md) | 完成 | Medium | indicator1 | MACD 指標（separate-pane），獨立 pane 正確顯示 DIF/DEA/histogram，移除後 pane 自動消失 |
| [indicator5](task-pool/indicator5.md) | 完成 | Medium | indicator2, indicator3, indicator4 | 指標清單 UI（可新增/移除多個指標實例），可同時疊加多指標且互不影響 |

### drawing Module

使用者手動畫直線：互動 primitive、模式切換、清除邏輯。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [drawing1](task-pool/drawing1.md) | 完成 | High | chart1 | `TrendLinePrimitive` 畫線互動 spike，改採按下拖曳（拖曳中即時預覽），桌面滑鼠與 pan/zoom 互斥已驗證可行，行動觸控驗證併入 drawing5 |
| [drawing2](task-pool/drawing2.md) | 完成 | High | drawing1 | `DrawingController` 正式實作（按下拖曳，拖曳中即時預覽），縮放/resize 後線條不跑位（僅桌面，觸控見 drawing5） |
| [drawing3](task-pool/drawing3.md) | 等待 | Medium | drawing2, chart3 | 切換股票自動清除畫線，切代號後線條消失（僅桌面，觸控見 drawing5） |
| [drawing4](task-pool/drawing4.md) | 等待 | Low | drawing2 | 多條線管理＋刪除單條線功能（僅桌面，觸控見 drawing5） |
| [drawing5](task-pool/drawing5.md) | 等待 | High | drawing2, drawing3, drawing4 | 行動觸控人工驗證（正式部署站台，待 drawing2/3/4 桌面完成並 push 到 main 後進行，一次性驗證並回報結果） |

### share Module

URL 分享（狀態序列化）與圖片分享（截圖、剪貼簿、Web Share）。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [share1](task-pool/share1.md) | 等待 | Medium | indicator1, drawing2 | `ShareState` schema + lz-string 編解碼，unit test 編碼後解碼與原始物件一致 |
| [share2](task-pool/share2.md) | 等待 | Medium | share1 | URL hash 還原邏輯，分享連結開新分頁貼上能完整還原畫面 |
| [share3](task-pool/share3.md) | 等待 | Low | drawing2 | `takeScreenshot(addTopLayer)` 驗證，截圖確認含手繪畫線內容 |
| [share4](task-pool/share4.md) | 等待 | Low | share3 | 桌面剪貼簿複製功能，複製後可貼到其他軟體顯示圖片 |
| [share5](task-pool/share5.md) | 等待 | Low | share3 | 行動裝置 Web Share API + 下載 fallback，手機實測分享到 LINE 成功 |

### responsive Module

RWD／行動裝置適配：斷點佈局、行動版面板、觸控手勢。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|
| [responsive1](task-pool/responsive1.md) | 等待 | Medium | chart3 | `useResponsive` + 斷點佈局骨架，縮放視窗/裝置模擬時佈局正確切換且圖表 resize |
| [responsive2](task-pool/responsive2.md) | 等待 | Medium | responsive1, indicator5 | 行動版指標面板 bottom sheet + 精簡工具列，手機/平板實測操作順暢 |
| [responsive3](task-pool/responsive3.md) | 等待 | Medium | responsive1, drawing2 | 觸控畫線手勢最終調整，真機測試畫線與 pan/zoom 切換無衝突 |

### Maintenance / Other

目前無項目。

| Task | 狀態 | 優先級 | 依賴 | 交付物 |
|---|---|---|---|---|

---

## Planning Files

- `design.md` — 專案整體設計文件（Context/技術棧/目錄結構/核心模組設計/待驗證項目，屬**規劃**文件，不代表目前已實作狀態）
- `technical-debt.md` — 已知技術債清單
- `../docs/deployment.md` — 實際部署設定（GitHub Pages workflow、本機開發指令）
- `../docs/data-layer.md` — 已實作資料層行為（provider registry、TwseProvider、逐月節流查詢、localStorage 快取）
- `../docs/indicators.md` — 已實作指標架構（IndicatorDefinition/registry、MA/布林通道/MACD 指標、指標清單 UI）
- `../docs/drawing.md` — 已實作畫線模組（TrendLinePrimitive、正式 DrawingController：模式切換、按下拖曳、多線陣列管理，切股清除/選取刪除單條線尚未實作）

---

## Module Dependencies

- infra -> data
- data -> chart
- chart -> indicator
- chart -> drawing
- indicator -> share
- drawing -> share
- indicator -> responsive
- drawing -> responsive
