import { useEffect, useState } from 'react';
import './ShareLinkButton.css';

/** 複製結果提示的顯示時間。 */
const FEEDBACK_MS = 2000;

type CopyStatus = 'idle' | 'copied' | 'failed';

const FEEDBACK_TEXT: Record<Exclude<CopyStatus, 'idle'>, string> = {
  copied: '已複製分享連結',
  failed: '複製失敗，請手動複製網址列',
};

/**
 * 分享按鈕（share2）：目前畫面狀態本來就持續同步在網址列的 hash 上，
 * 所以「分享」就只是把目前網址複製到剪貼簿，不需要另外組連結。
 */
export function ShareLinkButton() {
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timer = setTimeout(() => setStatus('idle'), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [status]);

  async function copyCurrentUrl() {
    try {
      // 非安全連線（http）或瀏覽器不支援時 clipboard 會是 undefined／writeText 會 reject，一律走失敗提示。
      await navigator.clipboard.writeText(window.location.href);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div className="share-link">
      <button type="button" className="share-link-button" onClick={copyCurrentUrl}>
        分享
      </button>
      {status !== 'idle' && (
        <span className="share-link-feedback" role="status">
          {FEEDBACK_TEXT[status]}
        </span>
      )}
    </div>
  );
}
