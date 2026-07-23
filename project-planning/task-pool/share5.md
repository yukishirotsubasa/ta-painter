# share5 — 行動裝置 Web Share API 與下載 Fallback

## 說明

在 `ShareMenu.tsx` 加入行動裝置分享路徑：用 `navigator.canShare({files:[file]})` 判斷能力後 `navigator.share({files:[file], title})` 叫出系統分享面板。不支援時退回觸發下載（`<a download>`）。判斷邏輯用能力偵測而非 UA 字串。

## 依賴

share3

## 驗收方式

1. 在真實手機（iOS Safari + Android Chrome）上點擊分享，系統分享面板正確叫出，可選擇 LINE 等 App 直接分享圖片檔。
2. 在不支援檔案分享的瀏覽器上測試，確認正確退回下載 PNG 檔案。
3. 分享的圖片檔名與內容正確（含股票代號/日期）。

## 實作說明

- `lib/share/imageShare.ts` 新增 `toPngFile()` / `supportsFileShare()` / `sharePngFile()` / `isShareAborted()`。
- `ShareMenu.tsx` 新增「分享圖片」鈕；`App` 傳入 `shareTitle={`TA Painter ${stockNo}`}`。
- **能力偵測要拿真的 `File` 去問**：`navigator.share` 存在不代表吃得下檔案（桌面 Chrome 常常只支援分享網址），
  必須 `canShare({ files: [file] })` 回 true 才走系統分享。
- **`AbortError` 不是失敗**：使用者在系統分享面板按取消時 `share()` 會 reject `AbortError`，
  此時靜靜回到 idle，不退回下載（否則「按取消卻多了一個檔案」）。其餘 reject 才退回下載。
- **新增同步截圖路徑 `canvasToPngBlobSync()` / `takeChartScreenshotBlobSync()`**：
  `navigator.share()` 不像 `ClipboardItem` 可以吃 `Promise<Blob>`，而且對 transient user activation 很嚴格
  （iOS Safari 尤其），中間插一個 `await` 就可能被拒。`canvas.toDataURL()` 是同步 API，解 base64 自行組 Blob
  就能在 click handler 內一路同步走到 `share()`。剪貼簿路徑維持非同步版（`ClipboardItem` 吃 promise，不必擋主執行緒），
  因此 `ChartHandle` 同時有 `takeScreenshot()`（Promise）與 `takeScreenshotSync()`。

## 驗證結果

單元測試共 254 項全綠（本任務新增 `imageShare.test.ts` 的 `toPngFile`／`supportsFileShare` 四種能力組合／
`sharePngFile` 參數／`isShareAborted` 只認 `AbortError`，與 `screenshot.test.ts` 的同步編碼路徑）。

瀏覽器實跑（dev server + `javascript_tool` 側錄，全程 console 無錯誤）。此環境**原生沒有** `navigator.share`／
`canShare`，因此第一列是真實的不支援情境，其餘用 stub 模擬：

| 情境 | `canShare` | `share()` | 結果 |
|---|---|---|---|
| 原生無 Web Share（本沙盒瀏覽器） | 未呼叫 | 未呼叫 | 下載 `ta-painter-2330-20260723.png`，提示「無法直接分享，已改為下載」 |
| 只支援分享網址（`canShare` 回 false） | 收到 `files:[File(image/png)]` | **未呼叫** | 退回下載 |
| 分享成功 | true | `{title:'TA Painter 2330', files:[…]}` | 提示「已分享圖片」，**沒有**下載 |
| 使用者取消（`AbortError`） | true | reject | **沒有**下載、沒有錯誤提示（回 idle） |
| 分享被拒（`NotAllowedError`） | true | reject | 退回下載 |

同步截圖路徑與非同步版的產物比對（真 chart + 兩條 `DrawingController` 畫線，色 `#ff00ff`／`#00ffff`）：

| | size | 尺寸 | magenta / cyan | 透明像素 | PNG magic |
|---|---|---|---|---|---|
| `takeChartScreenshotBlobSync()` | 120641 | 1440×1080 | 3516 / 3512 | 0 | 正確 |
| `takeChartScreenshotBlob()`（非同步） | 120641 | 1440×1080 | 3516 / 3512 | 0 | 正確 |

同步編碼耗時約 **82 ms**（1440×1080），使用者主動觸發，可接受。
另外回歸確認 share4 的「複製圖片」在 `ShareMenu` 改版後仍正常：真的 `clipboard.write()` resolve、104822 bytes PNG。

**未能自動驗證**：驗收方式 1 的真機測試（iOS Safari／Android Chrome 叫出系統分享面板、分享到 LINE）
—— 沙盒瀏覽器沒有 Web Share 也沒有系統分享面板，需在實機補測。
