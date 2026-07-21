# share2 — URL Hash 還原邏輯

## 說明

App 啟動時解析 `location.hash`（`#s=<lz-string編碼>`），成功解碼後依序：設定 symbol/provider → 觸發資料抓取 → 資料到齊後依 `indicators` 陣列從 registry 逐一 mount → 依 `lines` 陣列重建 `TrendLinePrimitive` 並 attach。使用者互動後用 `history.replaceState` 同步更新 hash。「分享」按鈕即複製目前網址列。

## 依賴

share1

## 驗收方式

1. 設定好股票代號、多個指標、畫幾條線後，複製目前網址，在新分頁貼上開啟，畫面完整還原（股票、指標種類與參數、線條位置）。
2. 手動修改 hash 為不合法字串開啟頁面，確認 App 正常載入（顯示錯誤提示，不白畫面/不崩潰）。
3. 操作過程中（換指標/畫線）hash 持續更新，但瀏覽器上一頁記錄沒有被灌爆（用 replaceState 而非 pushState）。
