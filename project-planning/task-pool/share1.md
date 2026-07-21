# share1 — ShareState Schema 與 lz-string 編解碼

## 說明

在 `lib/state/schema.ts` 用 zod 定義 `ShareState`（含版本欄位 `v:1`、symbol、market、provider、range、indicators 清單+非預設參數、lines 座標）。在 `urlState.ts` 實作 `encodeShareState`/`decodeShareState`，用 `lz-string` 的 `compressToEncodedURIComponent`/`decompressFromEncodedURIComponent`。

## 依賴

indicator1, drawing2

## 驗收方式

1. Unit test：任意合法 `ShareState` 物件經 `encode` 再 `decode` 後與原始物件深度相等。
2. Unit test：損壞/不合法的編碼字串經 `decode` 回傳明確的失敗結果（不拋未捕捉例外）。
3. 確認省略與 registry 預設值相同的參數後，decode 時能正確用預設值補回。
