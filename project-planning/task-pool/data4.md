# data4 — localStorage 快取層

## 說明

在 `web/src/lib/data/cache.ts` 實作以「月」為粒度的 localStorage 快取，key 格式如 `ohlcv:{provider}:{stockNo}:{YYYYMM}`。當月資料視為過期需重抓，歷史月份視為不可變、永久有效。維護一個 `cache:index` 記錄 key 清單與最後存取時間，超過容量門檻時做 LRU 淘汰。

## 依賴

data3

## 驗收方式

1. 查詢某股票某區間後，重新查詢同一區間，開啟瀏覽器 Network 面板確認沒有重複發送已快取月份的請求。
2. 確認第二次查詢的載入速度明顯快於第一次。
3. 手動塞入大量假資料觸發容量上限，確認 LRU 淘汰邏輯正確移除最舊項目而不影響最近查詢過的資料。
