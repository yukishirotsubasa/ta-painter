# share3 — takeScreenshot 與 addTopLayer 驗證

## 說明

在 `lib/chart/screenshot.ts` 實作 `chart.takeScreenshot(addTopLayer=true, includeCrosshair=false)` 產生 canvas 並轉 PNG blob。驗證設計文件待驗證項目 2：`addTopLayer:true` 是否真的把手繪的 `TrendLinePrimitive` 一併截入。若無效，備案是額外用 offscreen canvas 疊繪合成。

## 依賴

drawing2

## 驗收方式

1. 畫幾條線後觸發截圖，產出的 PNG 圖片中確實包含畫線內容。
2. 若原生 `addTopLayer` 無法截入畫線，改用備案方案後同樣驗證通過。
3. 截圖不包含十字準星殘影（`includeCrosshair:false` 生效）。

## 驗證結果（待驗證項目 2：結論為原生可用，不需 offscreen 備案）

先讀 `lightweight-charts@5.2` 原始碼確認機制，再於瀏覽器對**真實 chart 實例**白箱取像素驗證。

**機制**：每個 pane 有主畫布與 top 畫布兩張 canvas。primitive 的 pane view 依 `zOrder()` 決定畫在哪張——
`'normal'`（未實作 `zOrder()` 時的預設，`TrendLinePrimitive` 正是如此）畫在**主畫布**，只有 `'top'` 與十字準星在
top 畫布。`takeScreenshot()` 一定合成主畫布，`addTopLayer` 只決定要不要再疊上 top 畫布。因此手繪線本來就會被截入。
`includeCrosshair:false` 的實作是截圖期間暫時把 `crosshair.mode` 切成 `Hidden`、截完在 `finally` 還原。

**白箱驗證**（dev server 上 `javascript_tool` 動態 import 專案模組，建 800×600 真 chart + 60 根 K 棒，
用真的 `DrawingController.addLine()` 畫兩條對角線，色分別為 `#ff00ff` / `#00ffff`，再對截圖 canvas 取 `getImageData` 計數）：

| 檢查 | 結果 |
|---|---|
| `addTopLayer:false` 截圖含兩條線 | magenta 3770 px、cyan 4028 px（**線在主畫布，不需 top layer**） |
| `addTopLayer:true` 與 `false` 差異（無準星時） | 逐像素完全相同 |
| 移動十字準星後 `includeCrosshair:false` | 與「準星出現前」的截圖逐像素完全相同（**無殘影**） |
| 同一位置 `includeCrosshair:true` | 多出 9219 個不透明像素、差異 10683 px（確認上面的比較確實有東西可截） |
| 截圖後 `chart.options().crosshair.mode` | 仍為 `1`（Magnet），函式庫有還原 |
| `takeChartScreenshotBlob()` 產物 | `image/png`、120613 bytes、PNG magic `89 50 4E 47 0D 0A 1A 0A`、1440×1080 |
| 把該 PNG 解回 bitmap 重新取樣 | magenta 3516 px、cyan 3512 px、透明像素 0（**畫線確實存在於檔案裡**） |
| 全程 console error | 無 |

**額外發現（已一併處理）**：`ChartContainer` 的 `layout.background` 是 `transparent`，截圖主畫布也是透明的
（未補底色時 1,483,823 / 1,555,200 像素 alpha=0）。PNG 保留 alpha，貼到不處理透明度的軟體會變黑底，
因此 `takeChartScreenshotCanvas()` 預設用 `destination-over` 補上頁面 `--bg`（實測補後 alpha 全為 255、
角落像素 `rgb(22,23,29)` = `#16171d`）。可傳 `backgroundColor:null` 保留透明。

**尚未接 UI**：`ChartHandle.takeScreenshot()` 已備妥但主畫面還沒有觸發按鈕，按鈕屬 share4（複製）／share5（分享/下載）。
