# drawing5 — 行動觸控人工驗證（正式部署站台）

## 說明

集中驗證畫線功能（drawing1～drawing4）在行動觸控裝置上的完整行為，取代先前散落在各 drawing 任務裡各自的觸控驗證項目。**前置條件**：drawing2/drawing3/drawing4 桌面端實作與驗證都已完成，且已 push 到 `main`（`web/**` 有變更會觸發 `.github/workflows/deploy-pages.yml` 自動部署，見 [deployment.md](../../docs/deployment.md)）。本任務**必須在正式部署站台**（GitHub Pages 網址，非本機 `npm run dev`）上進行，因為本機自動化 Browser 預覽面板在先前的 spike（drawing1）中已確認其 `screenshot`／觸控事件模擬在此開發環境下不可靠，需要真機或瀏覽器 DevTools 對正式站台做人工驗證。

## 依賴

drawing2, drawing3, drawing4

## 驗收方式

1. 觸控拖曳建立一條線：按下（touchstart）記錄起點、拖曳中（touchmove）即時看到預覽線跟著手指移動、放開（touchend）定案，全程圖表不會被誤觸發原生 pan/zoom。
2. 畫線模式關閉後，單指拖曳恢復正常平移圖表、雙指恢復正常縮放。
3. 縮放圖表（pinch）或旋轉裝置改變視窗大小後，已畫的線仍正確錨定原本時間/價格位置。
4. 切換股票代號後，觸控環境下畫的線正確被清除（對應 drawing3）。
5. 觸控操作可畫出多條線、選取並刪除單條線，其餘線條不受影響（對應 drawing4）。
6. 記錄驗證結果：測試裝置/瀏覽器（如 iOS Safari、Android Chrome、桌面 Chrome DevTools 觸控模擬）、逐項是否通過、發現的問題與限制。若發現無法修復的限制，回頭更新 design.md 待驗證項目與相關 task 的說明。
