import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyPngToClipboard,
  downloadBlob,
  isShareAborted,
  screenshotFileName,
  sharePngFile,
  supportsClipboardImage,
  supportsFileShare,
  toPngFile,
} from './imageShare';

/** 測試環境是 node（無 DOM），瀏覽器 API 一律用 `vi.stubGlobal` 換成假物件。 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('supportsClipboardImage', () => {
  it('clipboard.write 與 ClipboardItem 都在時為 true', () => {
    vi.stubGlobal('ClipboardItem', class {});
    vi.stubGlobal('navigator', { clipboard: { write: () => Promise.resolve() } });
    expect(supportsClipboardImage()).toBe(true);
  });

  it('缺 ClipboardItem 時為 false（Firefox 舊版）', () => {
    vi.stubGlobal('ClipboardItem', undefined);
    vi.stubGlobal('navigator', { clipboard: { write: () => Promise.resolve() } });
    expect(supportsClipboardImage()).toBe(false);
  });

  it('缺 navigator.clipboard 時為 false（非安全連線）', () => {
    vi.stubGlobal('ClipboardItem', class {});
    vi.stubGlobal('navigator', {});
    expect(supportsClipboardImage()).toBe(false);
  });

  it('有 clipboard 但沒有 write（只支援 writeText）時為 false', () => {
    vi.stubGlobal('ClipboardItem', class {});
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    expect(supportsClipboardImage()).toBe(false);
  });
});

describe('copyPngToClipboard', () => {
  function stubClipboard() {
    const items: Record<string, unknown>[] = [];
    class FakeClipboardItem {
      constructor(data: Record<string, unknown>) {
        items.push(data);
      }
    }
    const write = vi.fn((_items: unknown[]) => Promise.resolve());
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    vi.stubGlobal('navigator', { clipboard: { write } });
    return { items, write };
  }

  it('以 image/png 寫入單一 ClipboardItem', async () => {
    const { items, write } = stubClipboard();
    const blob = { type: 'image/png' } as Blob;

    await copyPngToClipboard(blob);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toHaveLength(1);
    expect(items[0]).toEqual({ 'image/png': blob });
  });

  it('直接吃 Promise<Blob>：ClipboardItem 在 await 截圖前就建好（保住 user activation）', async () => {
    const { items, write } = stubClipboard();
    let resolveBlob!: (blob: Blob) => void;
    const pending = new Promise<Blob>((resolve) => {
      resolveBlob = resolve;
    });

    const copying = copyPngToClipboard(pending);

    // 截圖都還沒完成，write 就已經被呼叫了。
    expect(write).toHaveBeenCalledTimes(1);
    expect(items[0]['image/png']).toBe(pending);

    resolveBlob({ type: 'image/png' } as Blob);
    await expect(copying).resolves.toBeUndefined();
  });
});

describe('downloadBlob', () => {
  it('用 object URL 觸發 anchor 下載並在下一個 task 釋放', () => {
    vi.useFakeTimers();
    const anchor = { href: '', download: '', click: vi.fn() };
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadBlob({ type: 'image/png' } as Blob, 'ta-painter-2330-20260723.png');

    expect(anchor.href).toBe('blob:fake');
    expect(anchor.download).toBe('ta-painter-2330-20260723.png');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    // click 當下不能先 revoke，否則部分瀏覽器來不及取用。
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    vi.useRealTimers();
  });
});

describe('toPngFile', () => {
  it('帶上檔名與 image/png', async () => {
    const file = toPngFile(new Blob([new Uint8Array([1, 2, 3])]), 'ta-painter-2330-20260723.png');
    expect(file.name).toBe('ta-painter-2330-20260723.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(3);
  });
});

describe('supportsFileShare', () => {
  const file = toPngFile(new Blob(), 'a.png');

  it('share 與 canShare 都在且 canShare 對這個檔案回 true 時為 true', () => {
    vi.stubGlobal('navigator', { share: () => Promise.resolve(), canShare: () => true });
    expect(supportsFileShare(file)).toBe(true);
  });

  it('只支援分享網址、不吃檔案時為 false（桌面 Chrome）', () => {
    vi.stubGlobal('navigator', { share: () => Promise.resolve(), canShare: () => false });
    expect(supportsFileShare(file)).toBe(false);
  });

  it('沒有 canShare 時為 false，且不會硬闖 share()', () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share });
    expect(supportsFileShare(file)).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });

  it('完全沒有 Web Share 時為 false', () => {
    vi.stubGlobal('navigator', {});
    expect(supportsFileShare(file)).toBe(false);
  });

  it('把檔案原封不動放進 canShare 的 files', () => {
    const canShare = vi.fn(() => true);
    vi.stubGlobal('navigator', { share: () => Promise.resolve(), canShare });
    supportsFileShare(file);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
  });
});

describe('sharePngFile', () => {
  it('以 files + title 叫出系統分享面板', async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share });
    const file = toPngFile(new Blob(), 'a.png');

    await sharePngFile(file, 'TA Painter 2330');

    expect(share).toHaveBeenCalledWith({ files: [file], title: 'TA Painter 2330' });
  });
});

describe('isShareAborted', () => {
  it('使用者取消分享面板的 AbortError 為 true', () => {
    expect(isShareAborted(new DOMException('canceled', 'AbortError'))).toBe(true);
  });

  it('其他錯誤為 false（要退回下載）', () => {
    expect(isShareAborted(new DOMException('not allowed', 'NotAllowedError'))).toBe(false);
    expect(isShareAborted(new Error('AbortError'))).toBe(false);
  });
});

describe('screenshotFileName', () => {
  it('帶入代號與當日日期', () => {
    expect(screenshotFileName('2330', new Date(2026, 6, 23))).toBe('ta-painter-2330-20260723.png');
  });

  it('月份與日期補零', () => {
    expect(screenshotFileName('00631L', new Date(2026, 0, 5))).toBe('ta-painter-00631L-20260105.png');
  });
});
