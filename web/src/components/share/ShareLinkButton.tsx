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
 * 分享 URL 按鈕（share2）：網址平時保持乾淨（不隨操作同步 hash，見 `docs/share.md` 的「分享連結的產生時機」），
 * 按下才由 `buildShareUrl()` 用目前畫面狀態即時組出分享連結再複製到剪貼簿。
 * 按鈕文字帶上「URL」與旁邊的「複製圖片」「分享圖片」區隔，避免只寫「分享」看不出分享的是什麼。
 */
interface ShareLinkButtonProps {
  /** 用目前畫面狀態即時組出分享連結；編碼失敗時可丟例外，這裡一律走失敗提示。 */
  buildShareUrl: () => string;
  /** 行動版精簡工具列（responsive2）：按鈕文字縮短為「連結」，語意由旁邊的「分享圖」對比出來。 */
  compact?: boolean;
}

export function ShareLinkButton({ buildShareUrl, compact = false }: ShareLinkButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timer = setTimeout(() => setStatus('idle'), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [status]);

  async function copyCurrentUrl() {
    try {
      // 非安全連線（http）或瀏覽器不支援時 clipboard 會是 undefined／writeText 會 reject；
      // buildShareUrl 編碼失敗也可能丟例外，一律走失敗提示。
      await navigator.clipboard.writeText(buildShareUrl());
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div className="share-link">
      <button
        type="button"
        className="share-link-button"
        aria-label={compact ? '分享URL' : undefined}
        onClick={copyCurrentUrl}
      >
        {compact ? '連結' : '分享URL'}
      </button>
      {status !== 'idle' && (
        <span className="share-link-feedback" role="status">
          {FEEDBACK_TEXT[status]}
        </span>
      )}
    </div>
  );
}
