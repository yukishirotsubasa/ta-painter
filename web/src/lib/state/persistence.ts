import { z } from 'zod';
import { shareIndicatorSchema, shareProviderSchema, type ShareIndicator, type ShareProvider } from './schema';

/**
 * 本機設定持久化：把使用者的指標設定、最後瀏覽的代號與資料源存進 localStorage，下次開站自動還原。
 * **分享 URL 開啟的預覽模式不讀也不寫這裡**，由 `App.tsx` 判斷模式後決定是否呼叫（見 `docs/persistence.md`）。
 *
 * 儲存內容刻意與分享狀態（`ShareState`）共用同一套指標表示（`ShareIndicator`：`definitionId` + `params`），
 * App 端可直接複用 `toShareIndicators` / `toIndicatorInstances` 轉換，不必另立一份指標序列化邏輯。
 * 不存的東西：查詢區間（`range`，改由畫面寬度自動填滿，見「往前動態載入」）、畫線、指標實例 uuid。
 */

const SETTINGS_KEY = 'settings:v1';

const settingsSchema = z.object({
  /** 最後瀏覽的股票代號。 */
  symbol: z.string().min(1),
  /** 資料源，對應 `DataSource`。 */
  prov: shareProviderSchema,
  indicators: z.array(shareIndicatorSchema),
  /** 「使用還原價」開關；append-only 新欄位，舊 `settings:v1` 無此欄→預設 false（parse 不失敗）。 */
  useAdjusted: z.boolean().optional().default(false),
});

export interface PersistedSettings {
  symbol: string;
  prov: ShareProvider;
  indicators: ShareIndicator[];
  useAdjusted: boolean;
}

/** 與 `lib/data/cache.ts` 相同的防護：無痕模式或停用儲存時存取 localStorage 會丟例外。 */
function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * 讀取本機設定；沒有、解析失敗或內容不合法一律回 `null`（呼叫端改用預設值）。
 * 逐欄容錯不在這裡做——設定整包壞掉就當作沒存過，比部分還原更不易誤導。
 */
export function loadSettings(): PersistedSettings | null {
  if (!hasLocalStorage()) return null;

  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw === null) return null;

  try {
    const parsed = settingsSchema.parse(JSON.parse(raw));
    return parsed;
  } catch {
    return null;
  }
}

/** 寫入本機設定；儲存不可用或配額超限時靜默略過（持久化失敗不該影響畫面）。 */
export function saveSettings(settings: PersistedSettings): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 配額超限或序列化失敗：這次沒存成不影響使用，下次狀態變動會再試。
  }
}

/** 測試用：清掉本機設定。 */
export function clearSettings(): void {
  if (!hasLocalStorage()) return;
  localStorage.removeItem(SETTINGS_KEY);
}
