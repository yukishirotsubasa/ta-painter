import { useEffect, useState } from 'react';
import {
  copyPngToClipboard,
  downloadBlob,
  isShareAborted,
  sharePngFile,
  supportsClipboardImage,
  supportsFileShare,
  toPngFile,
} from '../../lib/share/imageShare';
import { ShareLinkButton } from './ShareLinkButton';
import './ShareMenu.css';

/** 操作結果提示的顯示時間（與 `ShareLinkButton` 一致）。 */
const FEEDBACK_MS = 2000;

type ImageStatus = 'idle' | 'copied' | 'shared' | 'downloaded' | 'failed';

const FEEDBACK_TEXT: Record<Exclude<ImageStatus, 'idle'>, string> = {
  copied: '已複製圖片到剪貼簿',
  shared: '已分享圖片',
  // 走到下載可能是「瀏覽器沒有這個 API」也可能是「有 API 但被拒（視窗沒焦點／權限被擋）」，用同一句涵蓋。
  downloaded: '無法直接分享，已改為下載',
  failed: '截圖失敗，請稍後再試',
};

interface ShareMenuProps {
  /** 取得目前圖表畫面的 PNG（非同步版，供剪貼簿用）；圖表尚未建立時回傳 `null`。 */
  takeScreenshot: () => Promise<Blob | null>;
  /** 同上的同步版（供 Web Share 用，見下方 `shareImage` 註解）。 */
  takeScreenshotSync: () => Blob | null;
  /** 下載與分享用的檔名。 */
  fileName: string;
  /** 系統分享面板顯示的標題。 */
  shareTitle: string;
}

/** 圖表還沒建立（例如查詢失敗只顯示錯誤訊息）時，把 `null` 轉成 reject 走統一的失敗路徑。 */
function requireBlob(screenshot: Promise<Blob | null>): Promise<Blob> {
  return screenshot.then((blob) => {
    if (!blob) throw new Error('圖表尚未建立，無法截圖');
    return blob;
  });
}

/**
 * 分享列（share4 + share5）：連結分享（share2 的 `ShareLinkButton`）與圖片分享並列。
 *
 * 兩條圖片路徑的 user activation 處理方式不同，因此截圖也用了不同版本：
 * - **複製圖片**（share4）：`ClipboardItem` 的值可以是 `Promise<Blob>`，所以 click handler 內同步建好
 *   `ClipboardItem` 並呼叫 `write()`，截圖在背景完成即可，不必擋主執行緒。
 * - **分享圖片**（share5）：`navigator.share()` 不吃 promise，且對 transient user activation 很嚴格
 *   （iOS Safari 尤其），中間插一個 await 就可能被拒，所以改用同步截圖，一路同步走到 `share()`。
 *
 * 兩者不支援或被拒時都退回下載，並沿用**同一份**截圖結果，不會重截。
 * 唯一的例外是使用者在系統分享面板按取消（`AbortError`）：那是使用者的決定，靜靜回到 idle，
 * 不該補一個下載檔給他。
 */
export function ShareMenu({ takeScreenshot, takeScreenshotSync, fileName, shareTitle }: ShareMenuProps) {
  const [status, setStatus] = useState<ImageStatus>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timer = setTimeout(() => setStatus('idle'), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [status]);

  function download(blob: Blob) {
    downloadBlob(blob, fileName);
    setStatus('downloaded');
  }

  function fallbackToDownload(screenshot: Promise<Blob | null>) {
    requireBlob(screenshot)
      .then(download)
      .catch(() => setStatus('failed'));
  }

  function copyImage() {
    const screenshot = takeScreenshot();

    if (!supportsClipboardImage()) {
      fallbackToDownload(screenshot);
      return;
    }

    copyPngToClipboard(requireBlob(screenshot))
      .then(() => setStatus('copied'))
      .catch(() => fallbackToDownload(screenshot));
  }

  function shareImage() {
    const blob = takeScreenshotSync();
    if (!blob) {
      setStatus('failed');
      return;
    }

    const file = toPngFile(blob, fileName);
    if (!supportsFileShare(file)) {
      download(blob);
      return;
    }

    sharePngFile(file, shareTitle)
      .then(() => setStatus('shared'))
      .catch((error: unknown) => {
        if (isShareAborted(error)) return;
        download(blob);
      });
  }

  return (
    <div className="share-menu">
      <ShareLinkButton />
      <button type="button" className="share-menu-button" onClick={copyImage}>
        複製圖片
      </button>
      <button type="button" className="share-menu-button" onClick={shareImage}>
        分享圖片
      </button>
      {status !== 'idle' && (
        <span className="share-menu-feedback" role="status">
          {FEEDBACK_TEXT[status]}
        </span>
      )}
    </div>
  );
}
