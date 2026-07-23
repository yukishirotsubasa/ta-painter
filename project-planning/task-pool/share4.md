# share4 — 桌面剪貼簿複製功能

## 說明

在 `ShareMenu.tsx` 加入「複製圖片」按鈕，桌面版用 `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` 複製截圖到剪貼簿。需在 click handler 的同一鏈路內完成以保留 user-activation。偵測 `navigator.clipboard?.write` 與 `window.ClipboardItem` 不存在時退回下載。

## 依賴

share3

## 驗收方式

1. Chrome/Edge 桌面版點擊「複製圖片」後，貼到小畫家或聊天軟體能看到正確的圖片內容。
2. 在不支援該 API 的瀏覽器（或模擬不支援）測試，確認正確退回下載行為而非報錯。

## 實作說明

- `lib/share/imageShare.ts`：`supportsClipboardImage()` / `copyPngToClipboard()` / `downloadBlob()` / `screenshotFileName()`。
  與 `lib/chart/screenshot.ts` 分開（設計文件原本把兩者畫在同一個 `screenshot.ts`）：那邊只管「圖表 → PNG blob」，
  這邊只管「blob 要送去哪」，share5 的 Web Share 也會放這裡。
- `components/share/ShareMenu.tsx`：包住 share2 的 `ShareLinkButton` 並加上「複製圖片」，App header 改用它。
- **user activation 的關鍵是不 await 截圖**：`ClipboardItem` 的值可以直接是 `Promise<Blob>`，
  所以 click handler 內同步啟動截圖、同步建好 `ClipboardItem` 並呼叫 `clipboard.write()`，
  瀏覽器在 activation 還有效的當下就收到請求（若先 `await` 截圖再 write，Safari 會直接拒絕）。
- fallback 沿用**同一個**截圖 promise 改走下載，不會為了下載再截一次。

## 驗證結果

單元測試 `lib/share/imageShare.test.ts` 9 項（能力偵測四種組合、`ClipboardItem` 在截圖完成前就建好、
下載用 object URL 與延後 revoke、檔名補零），全綠。

瀏覽器實跑（dev server + `javascript_tool` 白箱側錄，`computer` 真點擊保留 user activation，全程 console 無錯誤）：

| 情境 | 結果 |
|---|---|
| Chromium 點「複製圖片」 | 真的 `navigator.clipboard.write()` resolve，提示「已複製圖片到剪貼簿」 |
| 寫入剪貼簿的 `ClipboardItem` | `types: ['image/png']`、104822 bytes、PNG magic `89 50 4E 47 0D 0A 1A 0A` |
| 把該 blob 解回 bitmap 取樣 | 2023×1188、透明像素 0、角落 `rgb(22,23,29)`；漲色 55139 px／跌色 40149 px（**K 線確實在圖裡**） |
| 模擬 `ClipboardItem` 不存在（舊版 Firefox／http） | 完全沒呼叫 `clipboard.write`，改觸發下載 `ta-painter-2330-20260723.png`，提示「無法複製到剪貼簿，已改為下載」 |
| 模擬 API 在但 `write()` reject（視窗沒焦點／權限被擋） | 同樣退回下載，且 `URL.createObjectURL` 只呼叫 1 次（確認沒有重截一次） |

**沙盒限制與人工補驗**：`navigator.clipboard.read()` 在此沙盒被擋（`NotAllowedError: Read permission denied`），
無法把系統剪貼簿的內容讀回來比對；交給瀏覽器的 blob 內容本身已如上逐像素驗過。
剩下「貼到其他軟體」這一段由使用者人工實測，**結果正確**（2026-07-23 回報）。
