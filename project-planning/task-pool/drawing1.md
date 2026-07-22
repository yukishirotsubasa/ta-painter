# drawing1 — TrendLinePrimitive 畫線互動 Spike

## 說明

技術驗證性任務（spike）：用 lightweight-charts v5 的 `ISeriesPrimitive`/`IPanePrimitive` 機制做一個最小可行的畫線 demo，驗證設計文件（design.md）待驗證項目 1：畫線模式開啟時關閉 `handleScroll`/`handleScale` 是否確實阻擋原生 pan/zoom；觸控 tap 是否能可靠觸發 `subscribeClick`。

## 依賴

chart1

## 驗收方式

1. 桌面瀏覽器：畫線模式開啟後點擊圖表可放置端點畫出一條線，圖表不會同時被拖曳平移。
2. 桌面瀏覽器：畫線模式關閉後，pan/zoom 恢復正常。
3. 行動裝置（實機或 DevTools 觸控模擬）：tap 能可靠觸發放置端點的邏輯。
4. 將驗證結果（可行/不可行、實際限制）記錄下來，作為 drawing2 正式實作的依據；若發現待驗證項目的風險成真，需在此階段確認替代方案。

## 驗證結果（2026-07-22）

### 實作內容

- `web/src/lib/chart/drawing/trendLinePrimitive.ts`：`TrendLinePrimitive`（`ISeriesPrimitive`）+ `TrendLinePaneView`/`TrendLinePaneRenderer`。座標存 `{ time, price }` 邏輯座標，`paneView.update()` 在每次 `updateAllViews()`（viewport 變動時庫會呼叫）用 `chart.timeScale().timeToCoordinate()` + `series.priceToCoordinate()` 即時轉成 pixel 座標再畫線，符合 design.md 的「座標存邏輯座標、`draw()` 內即時轉換」設計。
- `web/src/components/chart/ChartContainer.tsx`：新增 `drawingMode` prop，開啟時 `chart.applyOptions({ handleScroll: false, handleScale: false })`，並 `chart.subscribeClick` 實作「點兩下決定端點」（第一擊記 `pending`、第二擊建立/更新 primitive 並 `series.attachPrimitive()`）。只接受 `paneIndex === 0`（主圖 pane）的點擊，避免用量能 pane 的 y 座標誤套主圖價格軸。
- `web/src/App.tsx`：加一顆「畫線模式：開/關」按鈕做 demo 切換。

### 驗證方式與結果

因這台機器上 Claude Code 的 Browser 預覽面板 `computer` 工具的 `screenshot`／座標點擊在此環境中会持续 timeout（連對 `https://example.com` 都會 timeout，確認是工具環境問題、與本專案程式碼無關），改用 `javascript_tool` 對真實 chart 實例／canvas 元素做白盒驗證，並用 `read_console_messages` 確認整個流程（含 chart 內部真正的 RAF repaint）都無 runtime error：

1. **桌面滑鼠點兩下畫線**：可行。對 canvas 依序 dispatch `mousedown`/`mouseup`（模擬點擊，需在不同 tick 分開兩次點擊——同一個 tick 內連續兩次會被庫內部的單擊/雙擊判斷邏輯合併，只算一次，這點程式碼設計上不受影響，只是重現流程時要留意）後：
   - `subscribeClick` callback 正確收到 `point`/`time`/`paneIndex`。
   - 兩次點擊後 `TrendLinePrimitive` 被建立並 `attachPrimitive`，`points` 正確存入兩個端點的 time/price。
   - 手動呼叫 `updateAllViews()` 確認 `paneView` 算出的 pixel 座標與點擊座標吻合（驗證 time/price → pixel 轉換管線正確）。
   - 之後 chart 內部 RAF repaint 呼叫 `draw()` 全程無 console error。
2. **畫線模式開啟時原生 pan 被阻擋**：可行，且用兩種方式都驗證過：
   - `chart.options().handleScroll`/`handleScale` 在開啟時所有子選項皆為 `false`。
   - 對 canvas 模擬一次完整的平滑拖曳手勢（`mousedown` → 連續多步 `mousemove` → `mouseup`），畫線模式開啟時 `chart.timeScale().getVisibleLogicalRange()` 拖曳前後完全不變（確認不只是選項關閉，而是真的擋下了拖曳）。
3. **畫線模式關閉後 pan 恢復正常**：可行，同一組拖曳手勢在關閉畫線模式後會讓 `getVisibleLogicalRange()` 明顯改變（`from`/`to` 位移量與拖曳距離吻合）。
4. **行動裝置觸控 tap**：**未能在本次環境中定論**。用 `Touch`/`TouchEvent` 建構子 dispatch `touchstart`+`touchend`（用真實 DOM listener 直接掛在 canvas 上確認事件本身有送達、`isTrusted: false` 但滑鼠版本同樣是 `isTrusted: false` 卻能正常觸發，故非 trusted 判斷造成），庫內部並未觸發 `subscribeClick`。無法排除是（a）此 Browser 預覽面板本身的畫布層渲染異常（同時觀察到所有 canvas 的 backing store 尺寸始終停在瀏覽器預設 300×150、未隨 `autoSize`/ResizeObserver 縮放到實際 1124×580 顯示尺寸，判斷此環境的 canvas resize/合成流程本身不正常，可能連帶影響觸控事件的內部 hit-test），還是（b）合成的 `Touch`/`TouchEvent` 缺漏了某個 lightweight-charts 內部辨識 tap 所需的欄位。查看 lightweight-charts 原始碼確認它是各自獨立監聽 `mousedown/mouseup/mousemove` 與 `touchstart/touchmove/touchend/touchcancel`（**不是**用 Pointer Events），且兩條路徑最終應該都會餵進同一個内部 click 判斷邏輯（`subscribeClick` 的 callback 簽名本身不分來源）。

### 結論 / 給 drawing2 的建議（點兩下模式，已被拖曳模式取代，見下方 2026-07-22 更新）

- 待驗證項目 1 的「pan/zoom 互斥」與「桌面點擊觸發 `subscribeClick`」兩部分**確認可行**。
- 「觸控 tap 可靠觸發 `subscribeClick`」**仍是開放風險**，本次未能用自動化工具排除。查看原始碼確認底層事件（`touchstart`/`touchend`）本身能正常送達 canvas，問題出在庫內部從 touch 事件辨識出「click」的邏輯，本次無法排除是環境限制還是真實限制。

## 更新：互動模式改為「按下拖曳」（2026-07-22）

使用者評估後認為拖曳操作上較直覺，決定放棄「點兩下決定兩端點」，改為**按下拖曳**：按下記錄起點、拖曳中即時預覽、放開定案。design.md 與 drawing2.md 已同步更新。

### 實作變更

- `web/src/components/chart/ChartContainer.tsx` 的 `drawingMode` 邏輯改寫：
  - 不再用 `chart.subscribeClick`。改用原生 `mousedown`/`touchstart` 監聽器（掛在 `containerRef` 上，非 chart API）取得按下瞬間的起點：因為 chart API 沒有「按下」事件可訂閱，起點座標改用 `chart.timeScale().coordinateToTime(x)` + `series.coordinateToPrice(y)` 自行換算（v5 新增的座標反查 API，drawing1 第一版沒用到）。
  - 拖曳中用 `chart.subscribeCrosshairMove` 取得即時座標，只要 `dragging` 為真就持續 `trendLineRef.current.setPoints([anchor, current])` 更新預覽線。
  - `mouseup`（掛在 `window`，避免放開時游標已離開 canvas 而漏接）/`touchend`/`touchcancel` 收尾，重置 `dragging`/`anchor`。
  - 新增一個 `touchmove` 監聽器（`{ passive: false }`）在 `dragging` 時呼叫 `preventDefault()`，避免瀏覽器原生觸控捲動搶走拖曳手勢。
- `TrendLinePrimitive` 本身（`trendLinePrimitive.ts`）**沒有改動**——它只負責存座標、依 `points` 畫線，跟互動方式（點擊 or 拖曳）無關，兩種模式都直接呼叫 `setPoints()`。

### 桌面驗證結果：確認可行

沿用之前的白盒驗證法（`javascript_tool` 操作真實 chart 實例，因 Browser 預覽面板 `screenshot` 工具在本環境持續 timeout，見上方舊版說明）。過程中發現一個新的環境細節：**合成 `mousemove` 事件若沒有先送出 `mouseenter`/`mouseover`，`subscribeCrosshairMove` 不會觸發**（送出 enter/over 後 crosshairMove 就正常持續觸發）；`mousedown`/`mouseup` 則不受此影響，直接可用。這是重現流程時的操作細節，不是程式碼問題。

驗證確認：

1. **按下建立起點**：`mousedown` 後 `pointFromClientXY()` 正確用 `coordinateToTime`/`coordinateToPrice` 算出 time/price，此時尚未建立 primitive（符合預期——單純按下不放開不該畫出東西）。
2. **拖曳中即時預覽**：`mousemove`（`buttons:1`）觸發 `subscribeCrosshairMove`，第一次移動即建立並 `attachPrimitive`，之後每次移動 `points` 的終點都跟著更新，全程無 console error。
3. **放開定案**：`mouseup` 後 `points` 維持在放開當下的座標；之後純 hover（`buttons:0`）不再改變 `points`（確認 `dragging` 旗標正確控制何時更新）。
4. **重新拖曳可畫新線**：對同一個 `trendLineRef` 再做一次完整拖曳，`points` 正確更新為新的起訖點。
5. **pan/zoom 互斥在拖曳手勢下依然成立**：在畫線模式開啟時對 canvas 做一次完整平滑拖曳（`mousedown`→多步 `mousemove`→`mouseup`），`chart.timeScale().getVisibleLogicalRange()` 拖曳前後完全不變；關閉畫線模式後同一組手勢會正常平移圖表（`getVisibleLogicalRange()` 明顯改變）。

### 行動觸控：驗證項目已移至 drawing5

拖曳模式下觸控路徑跟點擊模式不同：起點改由**我們自己的** `touchstart` 監聽器直接算座標（不再依賴庫內部把 touch 轉成 click 的邏輯），只有「拖曳中預覽更新」還是依賴 `subscribeCrosshairMove` 能否對 `touchmove` 正常反應——理論上風險比之前的「touch tap 觸發 subscribeClick」小一些，但尚未實測驗證。

原本規劃由使用者自行手動驗證，現已改為集中到 [drawing5](drawing5.md)：待 drawing2/drawing3/drawing4 桌面端都完成並部署到正式站台後，一次性驗證整個畫線模組（含這裡列的拖曳觸控風險）在觸控裝置上的行為，不再分散到各任務各自驗證。
