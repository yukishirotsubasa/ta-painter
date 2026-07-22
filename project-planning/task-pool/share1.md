# share1 — ShareState 混合式編解碼（短代碼 + lz-string）

## 說明

在 `lib/state/schema.ts` 用 zod 定義 `ShareState`（**無版本欄位**；含 `symbol`、`prov`=`yahoo|official`、`range`、`indicators`、`lines`）。採**混合式精簡編碼**：

- `indicators`：每指標以 `code:args` 表達。`code` 取 `IndicatorDefinition` 新增的 `urlCode` 穩定短代碼（如 `ma`）；`args` 依 `paramsSchema` 順序緊湊後綴並**省略等於預設值的參數**（source c/o/h/l/v、period 數字、color 去 `#` hex）。例：MA/volume/週期60/紅 → `ma:v.60.f00`；MA/close/週期20（皆預設）→ 只留 `ma`。
- `lines`：每條 `t1.p1.t2.p2.color.width`（time epoch 或 YYYYMMDD、price 浮點）。

在 `urlState.ts` 實作 `encodeShareState`/`decodeShareState`：精簡結構 → `lz-string.compressToEncodedURIComponent` → `#s=`；解碼反向並**逐項容錯**（單一指標或線段解析/驗證失敗即跳過該項，不影響其餘與整體，不拋未捕捉例外）。需在 `IndicatorDefinition`（`lib/chart/indicators/types.ts`）加 `readonly urlCode: string` 並為各指標補上。

## 依賴

indicator6, drawing7

## 驗收方式

1. Unit test：任意合法 `ShareState` 經 `encode` 再 `decode` 與原始物件深度相等。
2. Unit test：單一指標或單一線段編碼損壞時，`decode` 捨棄該項並成功還原其餘，不拋未捕捉例外。
3. 省略與 registry 預設值相同的參數後，`decode` 時能正確用預設值補回。
