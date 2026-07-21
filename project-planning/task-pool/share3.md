# share3 — takeScreenshot 與 addTopLayer 驗證

## 說明

在 `lib/chart/screenshot.ts` 實作 `chart.takeScreenshot(addTopLayer=true, includeCrosshair=false)` 產生 canvas 並轉 PNG blob。驗證設計文件待驗證項目 2：`addTopLayer:true` 是否真的把手繪的 `TrendLinePrimitive` 一併截入。若無效，備案是額外用 offscreen canvas 疊繪合成。

## 依賴

drawing2

## 驗收方式

1. 畫幾條線後觸發截圖，產出的 PNG 圖片中確實包含畫線內容。
2. 若原生 `addTopLayer` 無法截入畫線，改用備案方案後同樣驗證通過。
3. 截圖不包含十字準星殘影（`includeCrosshair:false` 生效）。
