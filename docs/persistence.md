# 本機設定持久化與預覽模式（`web/src/lib/state/persistence.ts`、`App.tsx`）

> 本文件記錄**已實作**的兩件事：把指標設定／最後瀏覽代號／資料源存進 localStorage，以及「透過分享連結開啟時把狀態隔離起來、不污染本機設定」的預覽模式。URL 分享本身見 [share.md](share.md)。

## 為什麼需要這一層

在此之前畫面狀態只存在兩個地方：React state（重整即消失）與 URL hash（隨每次操作即時回寫）。造成兩個問題：

1. 重開頁面一律回到 `2330` + 無指標，使用者每次都要重設一遍。
2. hash 既是「分享用的連結」又是「目前狀態的儲存處」，因此**開別人的分享連結＝直接覆蓋自己的畫面**，沒有回頭路。

拆法是讓兩者各司其職：**localStorage 存「我的設定」，URL hash 只在分享當下產生、開啟時唯讀**。

## 儲存內容（`lib/state/persistence.ts`）

```ts
const SETTINGS_KEY = 'settings:v1';

interface PersistedSettings {
  symbol: string;              // 最後瀏覽的股票代號
  prov: ShareProvider;         // 資料源，等同 DataSource（'yahoo' | 'official'）
  indicators: ShareIndicator[];// { definitionId, params }[]
}

loadSettings(): PersistedSettings | null
saveSettings(settings: PersistedSettings): void
clearSettings(): void          // 測試用
```

- **指標刻意重用 `ShareIndicator`**（`lib/state/schema.ts`，見 [share.md](share.md)）而不是另立一份序列化格式：`App.tsx` 直接用既有的 `toShareIndicators()` / `toIndicatorInstances()` 轉換，指標的存讀邏輯全站只有一份。驗證同樣重用 `shareIndicatorSchema`，外面再包一層 `settingsSchema`。
- **不存的東西**：
  - `range`（查詢區間）——改由畫面寬度自動填滿，見 [data-layer.md](data-layer.md) 的「往前動態載入」。存了反而會讓下次開站固定在上次捲到的位置。
  - 畫線——經評估後決定不持久化（線與當下的分析情境綁定，跨 session 保留意義不大），要保留請用分享連結。
  - `IndicatorInstance.id`（uuid 只在本機 session 有意義，還原時重新產生）。
- **容錯一律「整包當作沒存過」**：JSON 壞掉、schema 不符、`localStorage` 不存在都回 `null`，由呼叫端改用預設值。這裡刻意**不做逐欄容錯**——設定只有三個欄位，還原一半（例如代號還原了但指標沒有）比乾脆回預設更容易讓人誤判。
- 寫入失敗（無痕模式、quota 超限）靜默略過：持久化失敗不該影響畫面，下次狀態變動會再試一次。`hasLocalStorage()` 的 try/catch 防護與 [`lib/data/cache.ts`](../web/src/lib/data/cache.ts) 同一套寫法。

單元測試 `persistence.test.ts`（8 例）涵蓋：round-trip、覆寫、清除、壞 JSON、schema 不符、`localStorage` 不存在、`setItem` 丟 quota 例外。

## Session 模式（`App.tsx`）

掛載當下讀一次 `location.hash` 就決定整個 session 的模式，之後不再回讀、不監聽 `hashchange`：

```ts
const [initialShare] = useState(() => readShareHash(window.location.hash));
const restored = initialShare.status === 'ok' ? initialShare.state : null;

const [previewMode, setPreviewMode] = useState(restored !== null);
const [initialSettings] = useState(() => (restored ? null : loadSettings()));
```

| hash 狀態 | 模式 | 初始狀態來源 | 是否寫 localStorage |
|---|---|---|---|
| 有合法 `#s=…` | **預覽** | 分享連結 | **否** |
| 無 hash | 一般 | localStorage（沒有則預設值） | 是 |
| 有 `#s=` 但解不開 | 一般 | localStorage（另顯示解析失敗提示） | 是 |

**解析失敗歸為一般模式**是刻意的：連結既然還原不出東西，就沒有「要隔離的分享內容」，此時讓使用者回到自己的設定比留在空的預覽模式合理。

三個初始值各自套用同一條優先序（分享 → 本機 → 預設）：

```ts
code:       restored?.symbol     ?? initialSettings?.symbol     ?? DEFAULT_STOCK_NO
dataSource: restored?.prov       ?? initialSettings?.prov       ?? DEFAULT_DATA_SOURCE
indicators: restored?.indicators ?? initialSettings?.indicators ?? []
```

### 寫入時機

```ts
useEffect(() => {
  if (previewMode) return;
  saveSettings({ symbol: stockNo, prov: dataSource, indicators: toShareIndicators(indicators) });
}, [previewMode, stockNo, dataSource, indicators]);
```

一般模式下三個值任一變動就整包覆寫（內容很小，不做 diff）。**預覽模式直接 return** —— 這一行就是整個隔離需求的實作核心：預覽期間使用者照常可以加指標、換代號、畫線，畫面完全可操作，只是不落地。

### 退出預覽

預覽模式時 header 顯示提示列（`.app-preview-banner`）：`正在瀏覽分享內容（不會影響你的本機設定）` + 一顆「回到我的設定」按鈕。按下後：

```ts
const settings = loadSettings();
setPreviewMode(false);
setSymbol({ code: settings?.symbol ?? DEFAULT_STOCK_NO, market: null });
setDataSource(settings?.prov ?? DEFAULT_DATA_SOURCE);
setIndicators(toIndicatorInstances(settings?.indicators ?? []));
chartRef.current?.clearAllLines();
window.history.replaceState(null, '', window.location.pathname + window.location.search);
```

三個細節：

- **`clearAllLines()` 不能省**：切換股票時 `ChartContainer` 本來就會 `clearAll()`，但若本機設定的代號**剛好等於**分享連結的代號，`stockNo` 不變、切股清除不會觸發，分享來的線就會留在使用者自己的畫面上。
- **`replaceState` 拿掉 hash**：否則重新整理又會回到預覽模式。用 `pathname + search` 保留既有 query。
- 退出後 `previewMode` 轉 false，上面的持久化 effect 立刻把（現在已是使用者自己的）狀態寫回 localStorage。

## 手動驗證紀錄

沙盒 Chromium + `javascript_tool`（2026-07-24）。因沙盒連不到 CORS proxy，資料面改用兩種方式繞過：stub `window.fetch` 攔截 proxy URL 回合成 K 線，或預先塞好 `ohlcv:twse:2330:YYYY-MM` 月快取讓官方源完全不經網路取得資料。

- **持久化**：送出代號 `2317` 後 `localStorage['settings:v1']` 為 `{"symbol":"2317","prov":"yahoo","indicators":[]}`。
- **預覽隔離**（核心案例）：本機設定為 `1101/yahoo/無指標`，開啟帶 `2330/official/MA(20)/2 條線` 的分享連結後——提示列與「回到我的設定」按鈕都在、指標 chip 顯示 `MA(20)`、畫線清單 2 條，而 `settings:v1` **仍是 `1101/yahoo`未被覆蓋**。
- **退出預覽**：按下按鈕後 `location.hash` 為空字串、提示列消失、代號輸入框回到 `1101`、指標 chip 清空、`settings:v1` 內容不變。

## 已知限制 / 尚未實作

- **沒有「把這個分享內容存成我的設定」**：退出預覽是單向丟棄。若使用者想留下分享來的指標設定，目前只能自己照著重設一次。
- **只有單一組設定**：沒有多組 preset／命名設定檔的概念，`settings:v1` 永遠只存最後一次的狀態。
- **畫線不持久化**：見上方「不存的東西」。重整或切股即消失，與 [drawing.md](drawing.md) 的既有行為一致。
- **key 帶 `v1` 但沒有 migration 機制**：日後若欄位不相容，作法是換成 `settings:v2`（舊 key 自然被忽略），而不是就地升級——設定內容很小，重設成本遠低於維護 migration。
- **React 接線沒有元件測試**：模式判斷、持久化 effect、退出預覽的 state 重設都只有瀏覽器手測，純函式部分（`persistence.ts`）才有單元測試，見 [`technical-debt.md`](../project-planning/technical-debt.md)。
