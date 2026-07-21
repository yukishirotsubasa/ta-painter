# infra1 — 專案骨架與 GitHub Pages 部署流程

## 說明

建立 `web/` React + Vite + TypeScript 專案骨架，設定 `vite.config.ts` 的 `base` 對應 repo 名稱。建立 `.github/workflows/deploy-pages.yml`，監聽 `web/**` 變更，執行 `npm ci` → `npm run build` → `actions/upload-pages-artifact` → `actions/deploy-pages` 部署到 GitHub Pages。

## 依賴

無。

## 驗收方式

1. 本機 `npm run dev` 能啟動並在瀏覽器看到頁面（可先是預設 Vite 樣板畫面）。
2. push 到 main 後 GitHub Actions workflow 成功執行。
3. 用瀏覽器開啟實際 GitHub Pages URL，確認頁面成功渲染（含 base path 正確，資源無 404）。
