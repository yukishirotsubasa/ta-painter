/**
 * 截圖的輸出管道（share4）：剪貼簿複製與下載 fallback。
 *
 * 與 `lib/chart/screenshot.ts` 分開：那邊只負責「把圖表變成 PNG blob」（圖表領域），
 * 這邊只負責「把 blob 送到哪裡去」（平台能力），share5 的 Web Share 也會放這裡。
 * （設計文件把兩者都畫在 `screenshot.ts`，實作時拆開以免圖表與平台 API 混在同一個檔案。）
 *
 * 一律用能力偵測而非 UA 判斷：Firefox 到近期才支援 `ClipboardItem`，
 * 且 `navigator.clipboard` 在非安全連線（http）下根本不存在。
 */

const PNG_MIME = 'image/png';

/** 剪貼簿寫入圖片需要 `navigator.clipboard.write` 與 `ClipboardItem` 兩者都在。 */
export function supportsClipboardImage(): boolean {
  return typeof ClipboardItem === 'function' && typeof navigator?.clipboard?.write === 'function';
}

/**
 * 複製 PNG 到剪貼簿。刻意接受 `Promise<Blob>`：`ClipboardItem` 支援用 promise 當值，
 * 呼叫端就能在 click handler 內**同步**建好 `ClipboardItem` 並呼叫 `write()`，
 * 不必等截圖編碼完才呼叫（等下去會失去 transient user activation，Safari 直接拒絕）。
 */
export function copyPngToClipboard(blob: Blob | Promise<Blob>): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ [PNG_MIME]: blob })]);
}

/** 觸發瀏覽器下載（剪貼簿不可用時的 fallback，share5 的 Web Share 不可用時也共用）。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // 立刻 revoke 會讓部分瀏覽器來不及取用，延到下一個 task 再釋放。
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 把截圖 blob 包成可分享的檔案；Web Share 與下載都以檔名帶出代號與日期。 */
export function toPngFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, { type: PNG_MIME });
}

/**
 * 系統分享面板是否能分享這個檔案（share5）。用能力偵測而非 UA：
 * `navigator.share` 存在不代表吃得下檔案（桌面 Chrome 就常常只支援分享網址），
 * 必須拿真的 `File` 問過 `canShare({files})` 才算數。
 */
export function supportsFileShare(file: File): boolean {
  return (
    typeof navigator?.share === 'function' &&
    typeof navigator?.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

export function sharePngFile(file: File, title: string): Promise<void> {
  return navigator.share({ files: [file], title });
}

/**
 * 使用者在系統分享面板按取消時 `share()` 會 reject `AbortError`。
 * 這不是失敗，呼叫端不該因此改走下載（那會變成「按取消卻多了一個檔案」）。
 */
export function isShareAborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** 截圖檔名：`ta-painter-2330-20260723.png`。 */
export function screenshotFileName(stockNo: string, date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `ta-painter-${stockNo}-${stamp}.png`;
}
