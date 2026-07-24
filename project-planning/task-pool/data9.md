# data9 — 還原權值資料與換算

## 說明

為「使用還原價」功能提供資料基礎：取得還原收盤價、並提供把整份 K 線換成還原價、以及偵測除權息／分割日的純函式。**僅 Yahoo 源可行**（官方 TWSE／TPEx 端點只回原始價，另接除權息資料集成本過高，本次不做）。

- **型別**（`web/src/lib/data/types.ts`）：`OhlcvBar` 新增選填 `adjClose?: number`。Yahoo 填入、官方源留 undefined（多的欄位不影響既有快取與序列化）。
- **Yahoo provider**（`web/src/lib/data/providers/yahooProvider.ts`）：
  - 請求 URL 加 `&events=div|split`，回應才會附帶 `indicators.adjclose[0].adjclose`。
  - 擴充 `YahooChartResponse` 型別讀 `adjclose`；`resultToBars` 依 timestamp 同索引填入 `adjClose`（該日 `adjclose` 為 null 時該 bar 不帶 `adjClose`）。
- **換算純函式**（新增 `web/src/lib/data/adjustment.ts`）：
  - `toAdjustedBars(bars)`：對每根有 `adjClose` 的 bar，`factor = adjClose / close`，回傳 `{ ...bar, open/high/low × factor, close: adjClose }`；`close === 0` 或無 `adjClose` 者原樣保留（原物件參考，factor 視為 1）。**volume/time 不變（成交量不還原）**。
  - `detectAdjustmentDates(bars)`：逐根比較相鄰有效 factor 的相對變化超過門檻（1e-4）即視為除權息／分割日，回傳這些 bar 的 `time`；無 `adjClose` 的 bar 略過、不更新比較基準。

## 依賴

-（無，屬資料層基礎）

## 驗收方式

1. `toAdjustedBars`：factor=adjClose/close 正確套到 OHL、close 取 adjClose；無 adjClose／close=0 者回原物件參考；混合輸入只還原有 factor 的。
2. `detectAdjustmentDates`：factor 跳階日被抓出、次門檻浮點雜訊不誤判、無 adjClose 的 bar 不視為變動、全無 factor 回空陣列。
3. Yahoo provider：URL 帶 `events=div|split`；有 `adjclose` 時填 `adjClose`、null 時不填；既有無 adjclose 的測試回應仍正常解析。
4. 上游實測（2330，Yahoo）：`events=div|split` 確實回 `indicators.adjclose`，`detectAdjustmentDates` 對真實資料抓到與季配息一致的除權息日數。
