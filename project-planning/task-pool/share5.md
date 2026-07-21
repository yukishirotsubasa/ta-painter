# share5 — 行動裝置 Web Share API 與下載 Fallback

## 說明

在 `ShareMenu.tsx` 加入行動裝置分享路徑：用 `navigator.canShare({files:[file]})` 判斷能力後 `navigator.share({files:[file], title})` 叫出系統分享面板。不支援時退回觸發下載（`<a download>`）。判斷邏輯用能力偵測而非 UA 字串。

## 依賴

share3

## 驗收方式

1. 在真實手機（iOS Safari + Android Chrome）上點擊分享，系統分享面板正確叫出，可選擇 LINE 等 App 直接分享圖片檔。
2. 在不支援檔案分享的瀏覽器上測試，確認正確退回下載 PNG 檔案。
3. 分享的圖片檔名與內容正確（含股票代號/日期）。
