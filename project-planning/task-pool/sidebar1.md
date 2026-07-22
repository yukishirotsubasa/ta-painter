# sidebar1 — 可折疊設定側邊欄骨架

## 說明

版面重構為「側邊欄 + 圖表」兩欄（現況為單一縱向 flex）。側邊欄整體可折疊（收合成窄條/圖示按鈕，含 CSS transition）。把既有 `IndicatorPanel`（`web/src/components/chart/IndicatorPanel.tsx`）從頂部水平面板移入側邊欄，成為可折疊的「指標區塊」（點區塊頂部標題可折疊整區）。側邊欄由上而下：資料源區塊（置頂，見 sidebar2）→ 指標區塊 → 畫線區塊（見 sidebar3）。畫線模式開關維持在主畫面 header（不移入側邊欄）。折疊/展開側邊欄導致圖表容器尺寸變化時，需主動觸發 lightweight-charts resize（非只靠 CSS 顯示隱藏）。可於 `web/src/components/layout/` 新增 Sidebar 元件。

## 依賴

無。

## 驗收方式

1. 桌面版顯示「側邊欄 + 圖表」兩欄，側邊欄可收合成窄條再展開，圖表在收合/展開後尺寸正確更新（無留白、無裁切）。
2. 指標區塊在側邊欄內，點頂部標題可折疊/展開整區，內部保有原新增/移除/參數功能。
3. 畫線模式開關仍在主畫面 header，可正常開關。
