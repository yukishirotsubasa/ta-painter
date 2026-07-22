# drawing2 — DrawingController 正式實作

## 說明

基於 drawing1 的驗證結果，正式實作 `TrendLinePrimitive.ts`（渲染邏輯）與 `DrawingController.ts`（模式切換、事件處理、線條管理）。採**按下拖曳**互動模式（桌面與行動統一）：按下記錄起點、拖曳中即時預覽、放開定案。座標存邏輯座標（time+price），`draw()` 內即時用 `series.priceToCoordinate`/`timeScale.timeToCoordinate` 轉換。

## 依賴

drawing1

## 驗收方式（僅桌面；行動觸控驗證集中在 [drawing5](drawing5.md)）

1. 畫一條線後，縮放圖表（zoom in/out）或改變視窗大小（resize），線條仍正確錨定在原本的時間/價格位置，不跑位。
2. 畫線模式開啟時有明顯視覺提示（按鈕高亮/提示文字）。
3. 桌面滑鼠拖曳操作皆能正確完成畫線流程（按下→拖曳預覽→放開定案）。
