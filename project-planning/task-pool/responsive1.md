# responsive1 — useResponsive 與斷點佈局骨架

## 說明

實作 `hooks/useResponsive.ts`（監聽 `matchMedia`，斷點 `>=1024px` 桌面／`<1024px` 行動平板）。建立 `DesktopLayout.tsx`／`MobileLayout.tsx` 骨架，依斷點切換佈局元件，並在佈局切換時主動觸發圖表 resize（而非只靠 CSS 隱藏/顯示）。

## 依賴

chart3

## 驗收方式

1. 縮放瀏覽器視窗跨越 1024px 斷點，佈局正確在桌面版/行動版之間切換。
2. 用 DevTools 裝置模擬（不同解析度手機/平板）確認佈局正確對應。
3. 佈局切換後圖表容器尺寸正確更新（無留白、無裁切、無需手動 resize 視窗才生效）。
