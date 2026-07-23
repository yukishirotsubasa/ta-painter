/**
 * 側邊欄畫線清單的單行標籤，只顯示編號（`#1`、`#2`…）。
 * 起訖日期屬於不需揭露給使用者的內部座標資訊，刻意不呈現（人工測試回饋）。
 */
export function formatLineLabel(index: number): string {
  return `#${index + 1}`;
}
