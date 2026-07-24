# Technical Debt

> **決策標記說明**：每則未解債項都帶一行 `**決策**`——
>
> - **實作**：已排入 `task-list.md`，`對應任務` 指向該任務檔。
> - **延後**：已有任務檔但本輪不排入。
> - **Skip**：維持追蹤、不排任務，條件成熟再回頭處理。
>
> 已解決的條目直接移除（實作紀錄留在 `docs/` 與 git history）；決策為**不處理**的條目壓縮到文末「已關閉（不處理）」一節，只留結論與必要的提醒。
>
> 現況（2026-07-24 更新）：追蹤中 10 則（皆為 Skip）、已關閉不處理 8 則。

## 圖表色票與 CSS 變數需人工同步（`CHART_TEXT_COLOR`／`CHART_GRID_COLOR` vs `--text`／`--border`）

- **狀況**：chart4 把圖表座標文字色／格線色從 `ChartContainer.tsx` 的寫死 hex 搬到 `colors.ts` 的 `CHART_TEXT_COLOR = '#9ca3af'`／`CHART_GRID_COLOR = '#2e303a'`，但這兩個值與 `index.css` `:root` 的 `--text`／`--border` 是**兩份各自維護的相同色值**。根因是 lightweight-charts 以 canvas 渲染，讀不到 CSS variable；兩邊已互相加註解提醒要一起改。
- **影響**：目前值一致，無可觀察問題。日後調整整站文字／邊框色若只改 CSS，圖表座標文字與格線會留在舊色，造成頁面與 canvas 配色脫節（分享圖片同樣受影響）。
- **建議**：若之後真的常動色票，可在 `ChartContainer` mount 時用 `getComputedStyle(document.documentElement).getPropertyValue('--text')` 取值傳給 `createChart`，讓 CSS 成為單一來源；固定 dark 主題下沒有動態更新需求，讀一次即可。目前兩個值都是常態不變的，先不做。
- **決策（2026-07-24）**：**Skip**。等到實際需要改色票或引入主題切換時再回頭處理。

## 股票清單的有效性 gate 只擋「整份為空」，單一分類／單一來源縮水會靜默通過

- **狀況**：`web/scripts/stock-list/fetchSources.ts` 的 gate 是「該來源解析後 rows 為空 → 整體失敗」，判定粒度是**整個來源**。但 TWSE 端實際是三個分類（`股票`／`創新板`／`ETF`）各自累加，且分類名採**精確字串比對**（見 [`docs/stock-list.md`](../docs/stock-list.md)）。若 TWSE 只是把其中一類改名（例如 `創新板` → `創新板股票`），該類會整段被跳過、其餘兩類照常解析，rows 不為空 → gate 放行 → 靜默發佈一份少了一整類標的的清單，不會有任何失敗通知。同理，MOPS CSV 若某次只回傳少數幾列，也一樣會通過。解碼層也幫不上忙：Node 的 Big5/GBK 解碼器把 0x80–0xFF 單位元組映到私用區而不丟錯，`fatal: true` 攔不到「編碼猜錯」，gate 是唯一防線。
- **影響**：目前三個分類名與實際頁面完全吻合（2026-07-23 實跑：上市 1314 檔 + 上櫃 891 檔 = 2205 檔），沒有可觀察問題。但這類失效的特徵是**沒有錯誤訊息**——使用者只會發現某些代號搜不到，而不會有 workflow 標紅或通知信，排查成本遠高於直接失敗。
- **建議**：把 gate 從「非空」加嚴為「合理」，兩個成本很低的方向：
  1. 每個 TWSE 分類各自要求至少 N 筆（例如 `股票` ≥ 500、`ETF` ≥ 100、`創新板` ≥ 1），任一類掛零就整體失敗。
  2. 與 repo 內既有的 `web/public/stock-list.json` 比對總數，驟降超過某比例（例如 10%）就失敗；`main.ts` 本來就會讀舊檔做內容比對，拿得到舊清單，改動很小。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。清單每週更新、內容比對機制仍在；先維持現行 gate。若日後真的發生某類靜默消失，上面兩個加嚴方向成本都很低，屆時再做。
- **對應任務**：暫無（Skip）。

## 沒有元件測試環境，React 互動邏輯只能靠瀏覽器手測

- **狀況**：vitest 目前跑在 node 環境（未裝 jsdom／happy-dom 與 testing-library），所有測試都只涵蓋純函式。symbol2 把可測邏輯盡量抽成純函式（`searchStocks`／`findByCode`／`findByNamePrefix`／`resolveSubmitCode`，23 例），但 `ChartToolbar` 內的互動——↑/↓ 環繞選取、Enter 送出、`isComposing` 擋隱式送出、`onMouseDown` 早於 `blur`、`stockNo` 外部變動的同步 `useEffect`、提示訊息的清除時機——沒有任何自動化測試，本次是逐項在 dev server 上以 DOM 查詢驗證的。
- **影響**：這些互動細節（尤其 `isComposing` 與 `mousedown`/`blur` 的先後）正是最容易在重構時無聲壞掉的部分，回歸只能靠人工重測。另外沙盒環境的 Browser pane 無法截圖（`Screenshot timed out: the Browser pane is not displayed`），驗證只能靠 `javascript_tool` 讀 DOM，成本比一般手測更高。CDP 合成的 Enter 鍵也不會觸發表單的隱式送出，該路徑是改以 `form.requestSubmit()` 驗證、真實 Enter 由使用者複測確認。
- **現況（2026-07-23 更新，share2）**：`App.tsx` 新增的兩個 effect（分享線條的延後還原、狀態變動回寫 hash）同樣沒有元件測試涵蓋，純函式部分（`readShareHash`/`formatShareHash`/`toShare*` 轉換、`DrawingController.addLine()`）有 17 例單元測試。這次是用「手工組出含 2 條線的 hash → 在 dev server 上以 `javascript_tool` 讀 DOM 驗證」取代拖曳畫線，繞過了 canvas 互動測不了的限制。另記一個沙盒工具面的坑：Browser pane 對「只有 hash 不同」的網址不會重新載入文件（等同瀏覽器的 fragment 導航），`location.reload()` 實測也會把 hash 丟掉，要驗證「帶 hash 開新頁」必須讓網址在 hash 以外也有差異（例如加 `?r=1`）才會觸發真正的 document 載入。
- **現況（2026-07-23 更新，sidebar1/2/3）**：缺口再度擴大。側邊欄收合、區塊折疊、資料源切換、清單選取／刪除、折疊自動取消選取等互動同樣沒有元件測試，只有抽出的純函式（`lineSelection`、`lineLabel`、`applySubmittedCode`）有涵蓋。更嚴重的是**畫線相關端到端行為在沙盒內完全無法驗證**：Browser pane 為 hidden，CSS transition 與 rAF 凍結、canvas 不重繪、lightweight-charts 的 `subscribeCrosshairMove` 不觸發（實測對 container 與所有子元素派送合成 `mousedown`/`mousemove`/`mouseup` 都畫不出線），連第二個 pane 的 DOM row 與分隔線都要等實際 paint 才生成。因此「拖曳畫線 → 清單列出 → 點選高亮 → 刪除消失」只能靠使用者人工測。
- **現況（2026-07-23 更新，responsive1/2）**：斷點與佈局層的互動同樣沒有元件測試，只有 `useResponsive` 的 store 函式（`readBreakpoint`/`subscribeBreakpoint`，6 例，以 `vi.stubGlobal('window', …)` 假 MQL 驗證）與 `chipLabel.ts`（9 例）有涵蓋；`useLayoutEffect` 觸發 `ChartHandle.resize()`、`settingsOpen` 的斷點連動、圖例 chip 與參數小面板的互斥規則都靠手測。**另外發現 hidden pane 的凍結範圍比先前記錄的更廣**：`document.visibilityState === 'hidden'` 時整個 rendering steps 都不跑，因此 `requestAnimationFrame` 直接 timeout、`ResizeObserver` 回呼不觸發、**`matchMedia` 的 `change` 事件也不派送**（實測 `resize_window` 後 CSS media query 已套用、`matchMedia().matches` 已翻轉，但 React 收不到事件 → 佈局不切換），CSS transition 也不推進（側邊欄收合後 `getComputedStyle().width` 卡在起始值 260px，要暫時 `style.transition = 'none'` 才量得到終值 32px）。結論：**「拖曳視窗跨斷點」這類即時切換在沙盒內無法驗證**，只能「調整視窗尺寸 → 重新載入 → 量測初始渲染」，加上以程式化 `element.click()` 驅動互動後讀 DOM。
- **現況（2026-07-23 更新，share4/5）**：`ShareMenu` 的分支邏輯（剪貼簿成功／不支援／被拒、Web Share 成功／`canShare` 回 false／使用者取消／被拒、截圖回 `null` 的失敗路徑）同樣沒有元件測試，純函式部分（`imageShare` 的能力偵測與 `screenshot` 的編碼路徑）有 20 例單元測試。這次是在 dev server 上用 `javascript_tool` 側錄 `clipboard.write`／`canShare`／`share`／`HTMLAnchorElement.prototype.click`／`URL.createObjectURL`，再對每條分支各點一次按鈕來驗證——涵蓋度夠，但每次回歸都得重搭一次側錄，成本高且無法自動重跑。
- **現況（2026-07-24 更新，data8/share6）**：兩個任務的可測邏輯都抽成了純函式並有單元測試（`classifyDataError` 11 例），但**「錯誤分類 → 是否顯示提示」與「pending 綁定代號」的 React 接線本身仍無元件測試**：`error` state 帶 `kind` 後的條件渲染、`pendingLinesRef` 的比對與清空、hash 同步依賴 `bars` 才能即時解封——這三件都靠沙盒手測。這次的驗證手法比先前更省事，值得沿用：**用頁內 `await import('/ta-painter/src/lib/state/shareUrl.ts')` 直接叫應用自己的模組**（vite dev server 會供應原始碼模組）現場產分享連結，並以 `readShareHash(location.hash)` 反解 App 回寫的 hash 當作 `lines` state 的斷言依據，不必碰 canvas；互動則用 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` 繞過 React 的 value tracker 後 `form.requestSubmit()`。另記一個沙盒坑：`preview_start` 回報的 port 與 vite 實際監聽的 port 可能不同（vite 自行讓 port 時），要看 `preview_logs` 的 Local 網址，且 tab 偶爾會被彈回失效的網址，長流程最好壓成單一 `javascript_tool` 呼叫。
- **現況（2026-07-24 更新，六項新需求）**：本輪新增的 React 接線同樣沒有元件測試，可測邏輯已照慣例抽成純函式並補上單元測試（`persistence.ts` 8 例、`history.ts` 13 例、`screenshot.ts` 標題列 10 例，全案 314 passed）。**未被涵蓋的接線**：session 模式判斷（hash → preview／normal）、持久化 effect 的「預覽模式不寫」、退出預覽的 state 重設、`ChartContainer` 的可視範圍訂閱與前插視圖校正、`loadOlderBars` 的守門與重入處理。這次的沙盒驗證手法比先前更進一步，值得沿用：**(1) stub `window.fetch` 攔截 proxy URL 回合成 K 線**，讓整條查詢／自動填滿迴圈在無外網環境下可重現，並藉由記錄每次請求的 `period1`/`period2` 直接斷言「每批嚴格更舊、無重複區間、空批次後停手」；**(2) 預先塞好 `ohlcv:{provider}:{stockNo}:{YYYY-MM}` 月快取**，讓官方源完全不經網路取得資料（區間需避開當月，當月一律視為過期）；**(3) 攔截 `navigator.clipboard.writeText`／`write`** 取得分享連結與截圖 PNG，再用 `createImageBitmap` + `getImageData` 對標題列做像素級斷言。另記一個此前未記錄的坑：**前插資料的迴圈防護不能靠 state**——`.finally()` 解鎖早於 React re-render，舊 closure 會重複請求同一段而形成迴圈，控制旗標必須用 ref 並在送出當下推進。
- **現況（2026-07-24 更新，indicator12–23）**：新增 11 個常見指標 + 頭底分析，可測邏輯全在純函式與 `mount()` 契約（`compute()` 數值 + fake-chart，全案 440 passed）。**未被涵蓋的仍是 canvas 上的實際渲染**：頭底分析折線與頭/底標記位置、SAR 點列與多空分色、各 separate-pane 指標的線形與 price-line 參考線都只驗證了「餵給 series 的資料正確」，沒驗「畫出來長怎樣」。本輪特別記一個沙盒新坑：**即使 stub `window.fetch` 回合成 K 線、預塞月快取，這個 Browser pane 仍走不完 app 自身的資料查詢路徑**（圖表始終無 K 線、pane 為 hidden 故 canvas 不 compositing、`screenshot` timeout），因此指標的視覺回歸連「合成資料」這條路都走不通，只能靠本機 `npm run dev` 肉眼複測。指標新增下拉（indicator13）是本輪唯一的 React 接線，只有 `useState` 記選取值，無其他未測邏輯。
- **現況（2026-07-24 更新，還原價 data9/chart5）**：新增「使用還原價」功能，可測邏輯全在純函式（`adjustment.ts` 的 `toAdjustedBars`/`detectAdjustmentDates`、`VerticalLinePrimitive` 的座標／樣式 renderer，全案 458 passed）。**未被涵蓋的 React 接線**：`AdjustedPriceToggle` 的 disabled 連動、`App` 的 `displayBars`/`adjustmentDates` `useMemo` 是否在開關切換時正確重算、`ChartContainer` 對 `VerticalLinePrimitive` 的 attach/detach 生命週期。**canvas 視覺（K 線切換還原後跳空抹平、除權息垂直線位置）同樣測不到**，理由與上一則相同（Browser pane hidden、canvas 不 compositing、`screenshot` timeout）。本輪驗證手法值得沿用：**直接在頁面 context `fetch` app 用的同一個 Yahoo proxy URL（帶 `events=div|split`）**，斷言上游確實回 `indicators.adjclose`、並用與 `detectAdjustmentDates` 相同的 factor 跳階邏輯核對除權息日數（2330 抓到 4 個，與季配息一致）——不經 canvas 就驗證了資料面。DOM 面則讀 `.adjusted-price-option input` 的 `disabled`/`checked` 與 `settings:v1.useAdjusted` 確認開關與持久化接線。
- **建議**：加 `jsdom` + `@testing-library/react`（`vitest.config` 用 `environmentMatchGlobs` 只對元件測試切環境，避免拖慢既有純函式測試）。優先補的案例：↑/↓ 環繞、Enter 送出選取項、名稱查無時不呼叫 `onSubmit`、`stockNo` prop 變動同步輸入框、側邊欄折疊時清除選取、清單刪除呼叫 `ChartHandle.deleteLine`、`ShareMenu` 的 fallback 分支（stub 掉 `imageShare` 的能力偵測即可，不需要真的 canvas）、`upstream-blocked` 才渲染 `.app-error-hint`、pending 代號不符時不呼叫 `ChartHandle.addLine`。畫線本身（canvas 互動）即使加了 jsdom 也測不到，仍需人工。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。已明確知道缺口在哪、也已把可測邏輯盡量抽成純函式，目前選擇維持人工手測。本則**保留在清單上持續累積**——每次新增互動邏輯就更新「現況」段落，讓缺口規模保持可見，日後決定要補時有現成的優先案例清單。
- **對應任務**：暫無（Skip）。

## 指標的 UI／註冊順序被 `registerAll.ts` 的 import 行序決定，且受跨指標 import 干擾

- **狀況**：`listIndicators()` 的順序（即新增下拉選單的順序）等於 `registerAll.ts` 內 side-effect import 的**執行順序**，不是宣告順序。當一個指標模組 import 另一個指標模組時（目前只有 `dmi.ts` 用 `atr.ts` 的 `trueRange()`），被 import 的模組會先執行其檔尾的 `registerIndicator()`，於是 ATR 會「插隊」到 DMI 前面。已在 `registerAll.ts` 把 ATR 手動排到 DMI 之前讓行序與實際順序一致，並以 `registerAll.test.ts` 用精確 id 陣列鎖住整體順序。
- **影響**：目前順序正確、測試會攔到任何變動。但這是**隱性耦合**：日後若新增一組互相 import 的指標（例如某新指標重用另一指標的 `compute`），UI 順序會與 `registerAll.ts` 的行序不符，且**若沒有更新 `registerAll.test.ts` 的期望陣列就不會有任何提示**——測試只是鎖住「當下」的順序，不會告訴你「為什麼」跑掉。純視覺影響（選單順序），不影響功能或分享連結（後者靠 `urlCode` 精確比對，與順序無關）。
- **建議**：若順序需要穩定且與 import 無關，可改為在 `registerAll.ts` 明確 `import { XxxIndicator } from './xxx'` 後 `registerIndicator(XxxIndicator)`，把「註冊順序」從「模組副作用執行順序」手中拿回來；或在 `IndicatorDefinition` 加一個 `order` 欄位由 `listIndicators()` 排序。目前 15 個指標只有一組跨檔 import，成本效益不高。
- **決策（2026-07-24）**：**Skip**，維持追蹤不排任務。**新增互相 import 的指標時**：確認 `registerAll.ts` 的行序仍反映期望的 UI 順序，並同步更新 `registerAll.test.ts` 的 id 陣列。
- **對應任務**：暫無（Skip）。

## 股票清單型別在 `scripts/` 與 `src/` 各自宣告一份

- **狀況**：`Market` 與 `StockListEntry` 同時存在於 `web/scripts/stock-list/stockList.ts`（產出端）與 `web/src/lib/stock/types.ts`（消費端），內容相同但各自宣告。兩邊分屬 `tsconfig.node.json` 與 `tsconfig.app.json` 兩個編譯單元（`src/` 不能 import `scripts/`，否則 app 建置會把 Node 專用程式碼牽進來），所以不是單純忘了共用。
- **影響**：`stock-list.json` 的欄位若增減（例如未來加產業別、市場再細分），要同步改兩處；漏改一處不會有型別錯誤——消費端只是拿不到新欄位，或反過來把已消失的欄位當成必填而在 `isStockListEntry()` 把整份清單過濾成空，症狀是「搜尋突然什麼都找不到」而非編譯失敗。
- **建議**：真要共用的話，把型別抽到兩個 tsconfig 都納入的第三處（例如 `web/shared/stockList.types.ts`，純型別檔、無執行期程式碼），兩邊各自 `import type`。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。欄位目前穩定，共用要另開第三處純型別檔並同時調整兩個 tsconfig 的 include，成本效益不高。真的要增減欄位時再一併做——那也正是唯一會踩到這個坑的時機。
- **對應任務**：暫無（Skip）。

## 截圖有同步／非同步兩條產生路徑，`ChartHandle` 也因此有兩個方法

- **狀況**：同一張 PNG 有兩條產生路徑——`canvasToPngBlob()`（`toBlob`，非同步）給剪貼簿用，`canvasToPngBlobSync()`（`toDataURL` + 自解 base64，同步）給 Web Share 用；`ChartHandle` 對應曝光 `takeScreenshot()` 與 `takeScreenshotSync()`。這是刻意的：`ClipboardItem` 吃得下 `Promise<Blob>`，所以剪貼簿可以用非同步版不擋主執行緒；`navigator.share()` 不吃 promise 且對 transient user activation 嚴格（iOS Safari 尤其），中間插一個 `await` 就可能被拒，只能全程同步。兩者已實測產物一致（同尺寸、同 byte 數、同像素統計，見 [`docs/share.md`](../docs/share.md)）。
- **影響**：目前無行為差異，但截圖選項或後處理（例如日後加浮水印、加標題列、改底色策略）要改時得記得改兩處；漏改一處會造成「複製出來的圖」與「分享出去的圖」不一致，而且這種不一致只在其中一條路徑上看得到，不容易發現。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。結構本身已經是對的——差異已縮到只剩最後一步編碼。統一走非同步需要真機確認 iOS Safari 的 user activation 判定，而真機驗證已決定不做，風險過高。**維護守則**：任何截圖後處理（浮水印、標題列、底色策略）一律加在共用的 `takeChartScreenshotCanvas()`，不要加進兩個 `canvasToPngBlob*()`。
- **守則已實際套用一次（2026-07-24）**：新增的股名／代號標題列（`composeWithHeaderLabel`）即依此守則加在 `takeChartScreenshotCanvas()` 內，複製圖片與分享圖片兩條路徑因此自動一致，不需各自改動。這條守則有效，繼續沿用。
- **對應任務**：暫無（Skip）。

## 斷點 1024px 在 JS 與 CSS 各寫一份，且邊界重疊（正好 1024px 時兩邊同時成立）

- **狀況**：`hooks/useResponsive.ts` 用 `(min-width: 1024px)` 判定桌面版；`web/src/index.css` 既有的字級調整用 `@media (max-width: 1024px)` 判定行動版。兩者都寫死 1024，但**邊界方向相反且都含等號**——視窗**正好 1024px** 時，JS 認定 `desktop`（跑桌面佈局、完整工具列），CSS 卻同時套用行動版字級。CSS media query 無法讀 JS 常數（`DESKTOP_MIN_WIDTH`），反之亦然，目前沒有共用來源。
- **影響**：只有 1024px 這一個寬度會出現「桌面佈局配行動字級」的混搭，視覺上只是字略小，不影響功能。真正的風險是日後調整斷點時**只改一邊**——JS 改成 1280 而 CSS 留在 1024，會出現一段「桌面佈局但字級已縮小」的區間，而且沒有任何測試會攔到。
- **建議**：(1) 把 CSS 那側改成 `@media (max-width: 1023.98px)`，讓邊界互斥（成本最低）。(2) 若日後斷點會再調整，改由 JS 單一來源驅動——`useResponsive` 已經把斷點掛成 `.app-desktop`/`.app-mobile` class，字級規則可改寫成 class 選擇器，CSS 就不必再有自己的 media query。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。**若日後調整斷點，記得同時改 `useResponsive.ts` 的 `DESKTOP_MEDIA_QUERY` 與 `index.css` 的三處 `@media (max-width: 1024px)`。**
- **對應任務**：暫無（Skip）。

## 44px 觸控目標散在三個 CSS 檔，靠後代選擇器涵蓋，新增行動版 UI 時容易漏掉

- **狀況**：行動版的 ≥44px 觸控目標由三條後代選擇器提供——`.app-header-mobile`（`AppLayout.css`）、`.overlay-panel-body`（`OverlayPanel.css`）、`.app-mobile .indicator-legend`（`IndicatorLegend.css`）。選用後代選擇器是刻意的（沿用既有的斷點 class，不必再抄一份 1024px），但代價是「哪些容器有 44px 保護」變成一份沒有寫在任何一處的隱性清單，且每條規則都得各自重複 `box-sizing: border-box`、`input:not([type='radio'])` 排除、`button` 的 `min-width` 這幾個細節。
- **影響**：目前三個容器已涵蓋行動版所有可點元素（實測 390×844 逐一量測通過）。但日後若新增一個不在這三個容器內的行動版 UI（例如放在圖表上的浮動按鈕、或新的覆蓋層），它不會自動獲得 44px，而且**不會有任何錯誤或警告**，只能靠人工量測發現。
- **建議**：抽一個共用的 `.touch-target` utility class 放進 `index.css`，讓「這是觸控目標」變成明確標記而非容器繼承。現有三條規則可保留為 fallback。
- **決策（2026-07-23）**：**Skip**，維持追蹤不排任務。現在抽是為單一使用情境過度設計。**新增行動版 UI 時的檢查點**：若新元件不在上述三個容器之內，需自行確保 ≥44px（此時就是抽 `.touch-target` 的時機）。
- **對應任務**：暫無（Skip）。

## 還原價的成交量不還原（分割時量能未同步調整）

- **狀況**：`lib/data/adjustment.ts` 的 `toAdjustedBars()` 只把 factor（`adjClose/close`）套到 OHL、close 取 adjClose，**volume 維持原始值**。根因是 Yahoo 的 `adjclose` 混合了配息與分割兩種還原，其 factor 無法拆出「純分割比例」；而配息不影響成交量、只有分割才會讓歷史量能需要等比例調整。用混合 factor 去乘 volume 對配息日是錯的，因此乾脆不動。見 [`docs/adjusted-price.md`](../docs/adjusted-price.md)。
- **影響**：純配息（台股最常見）完全正確。只有發生**股票分割**的個股，其分割日之前的還原量能會與還原價的座標尺度不一致（例如 1 拆 2 後，舊量能在還原圖上看起來只有相鄰的一半）。台股分割極罕見，實務上幾乎不會踩到。
- **建議**：若要正確還原分割量能，需另外拿到**純分割比例**序列（Yahoo `&events=div|split` 的 `events.splits` 有 `numerator/denominator`），只對分割日的 factor 套到 volume（配息日 volume 不動）。目前 provider 未解析 `events.splits`（只用 `adjclose`），要做得先擴充 provider。
- **決策（2026-07-24）**：**Skip**，維持追蹤不排任務。分割在台股罕見、成本效益低；真的有需求（或使用者回報分割股量能怪異）時再解析 `events.splits` 補上。
- **對應任務**：暫無（Skip）。

## 手繪趨勢線不隨「使用還原價」開關重算

- **狀況**：手繪線以 time/price 邏輯座標儲存（`TrendLinePrimitive`，見 [`docs/drawing.md`](../docs/drawing.md)）。切換還原價會改變 K 線的價位尺度（除權息日之前的價格整體位移），但已畫的線仍停在原本的 price 座標，**不自動重算、也不自動清除**。刻意不清除是為了避免丟失使用者的畫線。
- **影響**：在有除權息的個股上、且跨越除權息日的手繪線，切換開關後會與 K 棒錯開（線相對於還原後的價格「浮」在原價位）。切回原狀態即恢復吻合。純視覺錯位，不影響資料或指標。
- **建議**：兩個方向——(1) 切換時把線的 price 端點依還原因子換算（需知道每個端點所在日期的 factor，畫線層目前不持有 bars）；(2) 切換時提示並清除跨除權息日的線。兩者都比現況複雜，且會牽動畫線層與資料層的耦合。
- **決策（2026-07-24）**：**Skip**，維持追蹤不排任務。使用者在還原／原始之間切換時通常會重畫線；自動換算的複雜度與收益不成比例。**若日後畫線需要跨還原狀態保持吻合**，走方向 (1)。
- **對應任務**：暫無（Skip）。

---

## 已關閉（不處理）

以下條目經評估後決定不再追蹤，僅保留結論與必要提醒。

- **三來源成交量口徑不一致（Yahoo 略低）**：Yahoo 不含盤後定價／鉅額交易（實測 2330 於 2024-09-02：TWSE 19,272,593 股 vs Yahoo 18,646,835 股，OHLC 一致）。依來源原樣顯示，不正規化、不加 tooltip 註明。
- **Yahoo 資料源不走 localStorage 月快取**（：Yahoo 走單次 `provider.fetchDaily()`，不經逐月快取與節流。維持現狀——單次查詢成本低，且快取解不了「短時間大量請求」；請求頻率改以代號送出的 300ms debounce（`App.tsx` 的 `QUERY_DEBOUNCE_MS` + `lib/stock/selection.ts`）控制。
- **本機 Node 版本無法直接執行股票清單抓取腳本**：本機 Node 20 跑不動需 22.6+ 型別剝除的 `scripts/`。決定不升級本機 Node，維持「本機只跑 parser 的 vitest、對真實來源實跑交給 CI 的 `workflow_dispatch`」。
- **覆蓋式側邊欄的疊層依賴 lightweight-charts 內部寫死的 z-index**：canvas 1/2、pane 分隔線把手 49/50，我方 `--z-sidebar` 60／`--z-dropdown` 70。唯一徹底解法（`layout.panes.enableResize: false`）會犧牲量能 pane 拖曳調高，決定保留該功能並接受耦合。**升級 lightweight-charts 時**用 `document.elementFromPoint` 抽查側邊欄各列（含 pane 分隔線所在 y）是否仍命中側邊欄元素。
- **Web Share 只在 stub 下驗證，真機未測**：真機驗證無法納入開發流程，接受 stub 對分支邏輯的覆蓋。所有失敗路徑最終退回下載（`AbortError` 為使用者主動取消），最壞情況只是行動裝置拿到下載檔。
- **觸控畫線手勢只在 fake `TouchEvent` 下驗證，真機未測**：同上理由。多指防呆四條路徑由 `drawingController.test.ts` 的 fake event 覆蓋，CSS 面以 computed style／`getBoundingClientRect()` 量測。
- **指標圖例的桌面版讓位靠 CSS class 與側邊欄寬度硬耦合**：側邊欄寬度維持展開／收合兩態就不會失準，改可拖曳調寬或抽屜皆不在規劃中。**`.app-settings-open` 這個 class 目前只有 `IndicatorLegend.css` 在用，重構時勿誤刪。**
- **設定面板與參數小面板缺鍵盤關閉與焦點管理**：面板刻意為非模態（無遮罩、開著仍可操作圖表），完整 modal 焦點處理與此設計相衝突；目標使用者以滑鼠與觸控為主。
