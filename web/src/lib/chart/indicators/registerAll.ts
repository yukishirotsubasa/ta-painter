/**
 * 一次註冊所有內建指標（side-effect import）。
 *
 * 每個指標模組在檔尾自行呼叫 `registerIndicator()`，這裡只負責把它們都載進來。
 * `App.tsx` 與需要完整 registry 的測試（如分享連結編解碼）都只 import 這一個檔案，
 * 新增指標時也只要在這裡加一行——這是指標清單唯一被列舉的地方。
 *
 * 排列順序即 `listIndicators()` 的順序，也就是 UI 新增選單的順序：
 * 先疊在主圖上的 overlay 指標，再需要獨立 pane 的指標。
 *
 * 注意：指標模組之間若互相 import（`dmi.ts` 用 `atr.ts` 的 `trueRange()`），被 import 的那個會先註冊，
 * 順序不會照這裡的行序。因此 ATR 刻意排在 DMI 前面，讓宣告順序與實際順序一致。
 */

// overlay（疊在 K 線主圖）
import './ma';
import './ema';
import './bollinger';
import './sar';
import './headBottom';

// separate-pane（各自佔一個子 pane）
import './macd';
import './kd';
import './rsi';
import './atr';
import './dmi';
import './cci';
import './williams';
import './bias';
import './roc';
import './obv';
