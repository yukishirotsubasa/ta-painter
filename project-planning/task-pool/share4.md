# share4 — 桌面剪貼簿複製功能

## 說明

在 `ShareMenu.tsx` 加入「複製圖片」按鈕，桌面版用 `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` 複製截圖到剪貼簿。需在 click handler 的同一鏈路內完成以保留 user-activation。偵測 `navigator.clipboard?.write` 與 `window.ClipboardItem` 不存在時退回下載。

## 依賴

share3

## 驗收方式

1. Chrome/Edge 桌面版點擊「複製圖片」後，貼到小畫家或聊天軟體能看到正確的圖片內容。
2. 在不支援該 API 的瀏覽器（或模擬不支援）測試，確認正確退回下載行為而非報錯。
