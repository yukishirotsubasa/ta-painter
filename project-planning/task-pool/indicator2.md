# indicator2 — MA 指標（Overlay + 參數面板）

## 說明

實作 `ma.ts`：`compute()` 對 `close` 計算簡單移動平均，`mount()` 用 `addSeries(LineSeries, {}, 0)` 疊加在主圖 pane。`paramsSchema` 定義週期參數（如 5/20/60），驅動 `IndicatorPanel.tsx` 自動產生參數輸入表單。

## 依賴

indicator1

## 驗收方式

1. 在圖表上啟用 MA 指標，主圖疊加出 MA 線。
2. 抽查幾天的 MA 數值與手動計算（或其他公開圖表工具）比對一致。
3. 調整參數面板的週期數值，圖表上的 MA 線即時更新。
4. 可同時啟用多條不同週期的 MA（如 MA5+MA20）互不干擾。
