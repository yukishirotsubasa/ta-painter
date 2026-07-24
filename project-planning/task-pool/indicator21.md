# indicator21 — BIAS 乖離率與 ROC 動能指標

## 說明

兩個以百分比表示的簡單比率型指標，各一個檔案，皆為 `separate-pane` 並加 0 軸參考線。

`bias.ts`：`id: 'bias'`、`urlCode: 'bi'`。參數 `period`（均線週期，預設 10）、`color`。
BIAS =（收盤 − n 日 SMA）/ n 日 SMA × 100。

`roc.ts`：`id: 'roc'`、`urlCode: 'rc'`。參數 `period`（預設 12）、`color`。
ROC =（今收 − n 日前收）/ n 日前收 × 100，前 period 根沒有比較基準不輸出。

兩者的分母為 0 時（真實股價不會發生，僅防呆）輸出 0。

## 依賴

indicator12

## 驗收方式

1. BIAS 在收盤價等於均線時恰為 0，偏離越大值越大；低於均線為負。
2. ROC 的 n 日報酬率與手算一致，價格未變時為 0。
3. ROC 輸出點數為 `bars.length - period`。
