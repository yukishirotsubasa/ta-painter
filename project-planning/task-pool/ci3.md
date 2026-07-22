# ci3 — proxy 健康檢查排程

## 說明

新增 GitHub Actions 排程（cron），定期 `curl` TPEx / Yahoo 兩個 proxy 端點（TPEx 個股、Yahoo `.TW`/`.TWO`），驗證回應正常；失敗時發通知（如自動開 issue 或其他告警），及早發現上游反爬蟲規則變動導致 proxy 失效（而非等使用者回報）。

## 依賴

無。

## 驗收方式

1. 排程可手動觸發，正常時通過並回報成功。
2. 模擬端點失敗時觸發告警通知。
