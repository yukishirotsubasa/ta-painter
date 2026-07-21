# TA Painter — 台股歷史資料圖表網站 設計文件

## Context

純前端、部署在 GitHub Pages 的台股（上市 TWSE + 上櫃 TPEx）歷史 OHLCV 圖表網站，支援常用技術指標（MA/MACD/布林通道，未來可擴充）、使用者手動畫直線（僅該次使用期間顯示，切股票即清除），以及兩種分享方式：URL 分享（分享互動網頁狀態）與圖片分享（分享結果快照，桌面複製剪貼簿、行動裝置走系統分享面板）。需同時支援桌面大螢幕與手機/平板窄螢幕。

規劃過程中已用 `curl` 實測驗證資料來源的 CORS 行為（關鍵發現，直接決定架構）：

- **TWSE（上市）** `STOCK_DAY` 官方 API 實測回應帶 `access-control-allow-origin: *`，瀏覽器可直接 fetch，**不需 proxy**。缺點：一次只回傳查詢月份當月資料，長區間要逐月發送多次請求。
- **TPEx（上櫃）** 官方 API（舊版 `dailyQuotes` 與新版 OpenAPI）實測**皆無** CORS header，瀏覽器直接 fetch 會被封鎖。
- TPEx 部分改用自建 **Cloudflare Worker** 當 CORS proxy 轉發；同時把 **Yahoo Finance** 資料源（同樣走這個 proxy）納入，作為「一次可拿長區間資料、查詢快」的來源，官方資料則保留為「較準確但長區間查詢慢、需節流」的來源，長區間查詢官方源時 UI 需顯示等待提示。

已用官方文件（lightweight-charts v5.2 `IChartApi` 文件）驗證 `takeScreenshot()`、`panes()`、`addSeries()`、`removeSeries()`、`subscribeClick()`、`subscribeCrosshairMove()` 皆真實存在，可作為核心圖表/畫線/截圖機制的技術基礎。

## 技術棧

- **前端**：React + Vite + TypeScript，部署 GitHub Pages
- **圖表庫**：`lightweight-charts@^5.0.x`（需 v5，v4 API 完全不同，無 `panes()`/primitive 機制）
- **CORS Proxy**：Cloudflare Worker（獨立小專案，只做轉發+加 CORS header，host allowlist 限制在 TPEx 與 Yahoo）
- **狀態管理**：zustand（輕量，符合這種單頁圖表應用規模）
- **URL 狀態編碼**：`lz-string`（`compressToEncodedURIComponent`），比純 base64 JSON 壓縮率高、比 `pako` 輕量，且輸出天生 URL-safe

## 專案目錄結構

```
D:\code\TA Painter\
├── web/                          # React+Vite 前端，部署 GitHub Pages
│   ├── vite.config.ts            # base: '/<repo-name>/'
│   ├── src/
│   │   ├── components/
│   │   │   ├── chart/            # ChartContainer, ChartToolbar, IndicatorPanel, DrawingToolbar, ShareMenu
│   │   │   └── layout/           # DesktopLayout, MobileLayout
│   │   ├── lib/
│   │   │   ├── data/
│   │   │   │   ├── types.ts              # OhlcvBar, StockDataProvider 介面
│   │   │   │   ├── providers/            # twseProvider, tpexProvider, yahooProvider, providerRegistry
│   │   │   │   ├── cache.ts              # localStorage 快取（月粒度、LRU 淘汰）
│   │   │   │   └── throttle.ts           # 序列化請求佇列 + 進度回報
│   │   │   ├── chart/
│   │   │   │   ├── indicators/           # types(IndicatorDefinition), registry, ma.ts, macd.ts, bollinger.ts
│   │   │   │   ├── drawing/              # TrendLinePrimitive(ISeriesPrimitive), DrawingController
│   │   │   │   └── screenshot.ts         # takeScreenshot + clipboard/Web Share 封裝
│   │   │   └── state/
│   │   │       ├── urlState.ts           # lz-string 序列化/還原
│   │   │       ├── appState.ts           # zustand store
│   │   │       └── schema.ts             # zod schema（含版本欄位 v:1）
│   │   └── hooks/                # useResponsive, useShare
├── worker/                       # Cloudflare Worker CORS proxy，獨立部署
│   ├── src/index.ts
│   └── wrangler.toml
└── .github/workflows/deploy-pages.yml   # 只監聽 web/** 變更，build+deploy 到 GH Pages
```

`web/` 與 `worker/` 是不同 runtime，分開資料夾各自獨立部署（worker 用 `wrangler deploy` 手動/獨立流程，不掛在 GH Pages workflow 上）。

## 核心模組設計

**資料層**：`StockDataProvider` 統一介面（`fetchDaily(stockNo, range, onProgress, signal)` 回傳 `OhlcvBar[]`），TWSE 直連、TPEx/Yahoo 走 Worker proxy 三個實作各自處理民國年轉換、逐月請求節流（序列化發送，間隔 300–500ms）、Yahoo symbol 後綴（`.TW`/`.TWO`）。`cache.ts` 用 localStorage 以「月」為粒度快取，當月資料視為過期需重抓，歷史月份永久有效，超量時 LRU 淘汰。UI 依 `estimateSlow(range)` 決定是否顯示等待提示/建議切換 Yahoo。

**指標可擴充架構**：`IndicatorDefinition`（`compute()` 純函式算數值、`mount()` 負責掛到 chart 的 series/pane）+ `registry.ts` 動態註冊表，UI 的指標清單與參數表單完全從 registry 動態產生，新增指標只需新增一個檔案註冊，不改 UI 元件。MA/布林通道用 overlay（掛主圖 pane 0），MACD 用 separate-pane（動態分配 paneIndex，指標移除時歸還）。

**手動畫線**：用 lightweight-charts v5 的 Series Primitives（`ISeriesPrimitive`/`IPanePrimitive`）實作 `TrendLinePrimitive`，座標存邏輯座標（time+price）而非 pixel，`draw()` 內即時轉換確保縮放/resize 不跑位。畫線模式與原生 pan/zoom 互斥（開啟時關閉 `handleScroll`/`handleScale`），桌面與行動統一採「點兩下決定兩端點」互動模式（比拖曳更省事、更適配觸控精度）。切換股票時 `DrawingController.clearAll()` 清空記憶體中的線條陣列，不持久化。

**URL 分享**：`ShareState`（含版本欄位）序列化 symbol、已選指標+非預設參數、畫線座標，用 `lz-string` 壓縮進 URL hash（用 hash 而非 query string，避免 GH Pages 靜態託管對 query 的潛在 rewrite 問題）。載入時解析 hash 還原完整畫面；使用者操作時用 `history.replaceState` 同步更新，不塞爆瀏覽器歷史記錄。

**圖片分享**：`chart.takeScreenshot(addTopLayer=true, includeCrosshair=false)` 產生 canvas → PNG blob。桌面用 `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` 複製到剪貼簿（需偵測 API 存在，Firefox 相容性較晚，不支援則退回下載）；行動裝置用 `navigator.canShare({files})` 判斷後 `navigator.share({files})` 叫出系統分享面板（可直接分享到 LINE 等），不支援則退回下載。用能力偵測（非 UA 判斷）決定走哪條路徑。

**RWD**：斷點 `>=1024px` 桌面（側邊欄常駐指標面板+圖例）／`<1024px` 行動平板（指標面板收合為 bottom sheet，精簡工具列，圖例用可橫向滑動 chip list）。用 `useResponsive`（`matchMedia`）驅動佈局切換並主動觸發圖表 resize。

**Cloudflare Worker**：`/proxy/{tpex|yahoo}/...` 路徑白名單轉發到對應官方 host 並加 CORS header，不接受任意 `?url=` 目標（避免開放代理風險）。

## 待驗證項目（開發過程中需 spike 驗證，不確定的官方 API 邊界）

1. 觸控環境下「畫線模式」對 `handleScroll`/`handleScale` 的關閉是否確實阻擋原生 pan/zoom，且觸控 tap 能可靠觸發 `subscribeClick`。
2. `takeScreenshot(addTopLayer:true)` 是否真的會把手繪 `TrendLinePrimitive` 一併截入（若無效，備案是另外用 offscreen canvas 疊繪合成）。
3. TPEx OpenAPI（`/openapi/v1/tpex_mainboard_daily_close_quotes`）是否支援歷史區間查詢，還是只回傳當日快照（若只有當日快照，歷史查詢須改用逐月 `dailyQuotes` 接口）。
