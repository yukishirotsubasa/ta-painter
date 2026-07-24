import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IChartApi } from 'lightweight-charts';
import {
  canvasToPngBlob,
  canvasToPngBlobSync,
  composeWithHeaderLabel,
  fillCanvasBackground,
  resolvePageBackgroundColor,
  resolvePageHeadingColor,
  takeChartScreenshotBlob,
  takeChartScreenshotBlobSync,
  takeChartScreenshotCanvas,
} from './screenshot';

/**
 * 測試環境是 node（無 DOM），一律用只實作實際會被呼叫到方法的假物件，
 * 沿用 `drawingController.test.ts` 的作法。
 */
function createFakeContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    globalCompositeOperation: '' as string,
    fillStyle: '' as string,
  };
}

/** 三個 byte（1,2,3）的 base64；同步版會把它解回 bytes 組成 Blob。 */
const FAKE_PNG_DATA_URL = 'data:image/png;base64,AQID';

function createFakeCanvas(options: { context?: unknown; blob?: Blob | null; dataUrl?: string } = {}) {
  const context = options.context === undefined ? createFakeContext() : options.context;
  const canvas = {
    width: 800,
    height: 600,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback) => {
      callback(options.blob === undefined ? ({ type: 'image/png' } as Blob) : options.blob);
    }),
    toDataURL: vi.fn(() => options.dataUrl ?? FAKE_PNG_DATA_URL),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, raw: canvas, context };
}

function createFakeChart(canvas: HTMLCanvasElement) {
  const takeScreenshot = vi.fn(() => canvas);
  return { chart: { takeScreenshot } as unknown as IChartApi, takeScreenshot };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fillCanvasBackground', () => {
  it('以 destination-over 把底色填在既有內容下方，覆蓋整張 canvas', () => {
    const { canvas, context } = createFakeCanvas();
    const ctx = context as ReturnType<typeof createFakeContext>;
    // fillRect 當下的 composite/fillStyle 才是有效值，restore 後的欄位值無意義，故在呼叫時取樣。
    let compositeAtFill = '';
    let fillStyleAtFill = '';
    ctx.fillRect.mockImplementation(() => {
      compositeAtFill = ctx.globalCompositeOperation;
      fillStyleAtFill = ctx.fillStyle;
    });

    fillCanvasBackground(canvas, '#16171d');

    expect(compositeAtFill).toBe('destination-over');
    expect(fillStyleAtFill).toBe('#16171d');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('取不到 2d context 時不丟錯（截圖維持透明背景）', () => {
    const { canvas } = createFakeCanvas({ context: null });
    expect(() => fillCanvasBackground(canvas, '#16171d')).not.toThrow();
  });
});

describe('resolvePageBackgroundColor', () => {
  it('讀 documentElement 的 --bg', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => ' #ffffff ' }));
    expect(resolvePageBackgroundColor()).toBe('#ffffff');
  });

  it('--bg 不存在時退回預設底色', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
    expect(resolvePageBackgroundColor()).toBe('#16171d');
  });
});

describe('takeChartScreenshotCanvas', () => {
  it('預設帶 addTopLayer=true、includeCrosshair=false', () => {
    const { canvas } = createFakeCanvas();
    const { chart, takeScreenshot } = createFakeChart(canvas);

    takeChartScreenshotCanvas(chart, { backgroundColor: null });

    expect(takeScreenshot).toHaveBeenCalledWith(true, false);
  });

  it('選項可覆寫 addTopLayer／includeCrosshair', () => {
    const { canvas } = createFakeCanvas();
    const { chart, takeScreenshot } = createFakeChart(canvas);

    takeChartScreenshotCanvas(chart, { addTopLayer: false, includeCrosshair: true, backgroundColor: null });

    expect(takeScreenshot).toHaveBeenCalledWith(false, true);
  });

  it('backgroundColor 為 null 時不補底色，保留透明背景', () => {
    const { canvas, context } = createFakeCanvas();
    const { chart } = createFakeChart(canvas);

    const result = takeChartScreenshotCanvas(chart, { backgroundColor: null });

    expect(result).toBe(canvas);
    expect((context as ReturnType<typeof createFakeContext>).fillRect).not.toHaveBeenCalled();
  });

  it('省略 backgroundColor 時補上頁面 --bg', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#123456' }));
    const { canvas, context } = createFakeCanvas();
    const ctx = context as ReturnType<typeof createFakeContext>;
    let fillStyleAtFill = '';
    ctx.fillRect.mockImplementation(() => {
      fillStyleAtFill = ctx.fillStyle;
    });
    const { chart } = createFakeChart(canvas);

    takeChartScreenshotCanvas(chart);

    expect(fillStyleAtFill).toBe('#123456');
  });
});

/** 標題列合成會用到繪圖與量測方法，比 fillCanvasBackground 的假 context 多幾支。 */
function createFakeHeaderContext() {
  return {
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '' as string,
    font: '' as string,
    textAlign: '' as string,
    textBaseline: '' as string,
  };
}

/** 把 `document.createElement('canvas')` 換成假 canvas，回傳它與其 context 供斷言。 */
function stubCreatedCanvas(context: unknown = createFakeHeaderContext()) {
  const created = { width: 0, height: 0, getContext: vi.fn(() => context) };
  vi.stubGlobal('document', {
    documentElement: {},
    createElement: vi.fn(() => created as unknown as HTMLCanvasElement),
  });
  return { created, context };
}

describe('composeWithHeaderLabel', () => {
  const STYLE = { backgroundColor: '#16171d', textColor: '#f3f4f6', scale: 2 };

  it('輸出 canvas 寬度不變、高度多出依 scale 放大的標題列', () => {
    const { created } = stubCreatedCanvas();
    const { canvas } = createFakeCanvas();

    const out = composeWithHeaderLabel(canvas, '台積電 2330', STYLE);

    // 標題列 34 CSS px × scale 2 = 68 device px。
    expect(created.width).toBe(800);
    expect(created.height).toBe(600 + 68);
    expect(out).toBe(created as unknown as HTMLCanvasElement);
  });

  it('先鋪滿底色，再把圖表貼在標題列下方', () => {
    const context = createFakeHeaderContext();
    stubCreatedCanvas(context);
    const { canvas } = createFakeCanvas();
    let fillStyleAtRect = '';
    context.fillRect.mockImplementation(() => {
      fillStyleAtRect = context.fillStyle;
    });

    composeWithHeaderLabel(canvas, '台積電 2330', STYLE);

    expect(fillStyleAtRect).toBe('#16171d');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 800, 668);
    expect(context.drawImage).toHaveBeenCalledWith(canvas, 0, 68);
  });

  it('標題文字依 scale 放大，垂直置中於標題列、左側留內距', () => {
    const context = createFakeHeaderContext();
    stubCreatedCanvas(context);
    const { canvas } = createFakeCanvas();
    let fillStyleAtText = '';
    context.fillText.mockImplementation(() => {
      fillStyleAtText = context.fillStyle;
    });

    composeWithHeaderLabel(canvas, '台積電 2330', STYLE);

    // 字級 17 × 2 = 34px、左內距 12 × 2 = 24、基線置中於 68 / 2 = 34。
    expect(context.font).toContain('34px');
    expect(context.textBaseline).toBe('middle');
    expect(context.fillText).toHaveBeenCalledWith('台積電 2330', 24, 34);
    expect(fillStyleAtText).toBe('#f3f4f6');
  });

  it('scale=1 時不放大（低 DPI 螢幕）', () => {
    const { created } = stubCreatedCanvas();
    const { canvas } = createFakeCanvas();

    composeWithHeaderLabel(canvas, '2330', { ...STYLE, scale: 1 });

    expect(created.height).toBe(600 + 34);
  });

  it('取不到 2d context 時退回原圖，不讓整個截圖失敗', () => {
    stubCreatedCanvas(null);
    const { canvas } = createFakeCanvas();

    expect(composeWithHeaderLabel(canvas, '2330', STYLE)).toBe(canvas);
  });
});

describe('resolvePageHeadingColor', () => {
  it('讀 documentElement 的 --text-h', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => ' #f3f4f6 ' }));
    expect(resolvePageHeadingColor()).toBe('#f3f4f6');
  });

  it('--text-h 不存在時退回預設文字色', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
    expect(resolvePageHeadingColor()).toBe('#f3f4f6');
  });
});

describe('takeChartScreenshotCanvas 的標題列', () => {
  it('省略 headerLabel 時不合成，直接回傳圖表 canvas', () => {
    const { created } = stubCreatedCanvas();
    const { canvas } = createFakeCanvas();
    const { chart } = createFakeChart(canvas);

    expect(takeChartScreenshotCanvas(chart, { backgroundColor: null })).toBe(canvas);
    expect(created.height).toBe(0);
  });

  it('帶 headerLabel 時回傳加上標題列的新 canvas', () => {
    const { created } = stubCreatedCanvas();
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#f3f4f6' }));
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const { canvas } = createFakeCanvas();
    const { chart } = createFakeChart(canvas);

    const out = takeChartScreenshotCanvas(chart, { backgroundColor: '#16171d', headerLabel: '台積電 2330' });

    expect(out).toBe(created as unknown as HTMLCanvasElement);
    expect(created.height).toBe(600 + 34);
  });
});

describe('canvasToPngBlob', () => {
  it('以 image/png 輸出 blob', async () => {
    const blob = { type: 'image/png' } as Blob;
    const { canvas, raw } = createFakeCanvas({ blob });

    await expect(canvasToPngBlob(canvas)).resolves.toBe(blob);
    expect(raw.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  });

  it('toBlob 回 null 時 reject', async () => {
    const { canvas } = createFakeCanvas({ blob: null });
    await expect(canvasToPngBlob(canvas)).rejects.toThrow('canvas.toBlob() 產生截圖失敗');
  });
});

describe('canvasToPngBlobSync', () => {
  it('用同步的 toDataURL 產生 image/png blob，內容與 base64 一致', async () => {
    const { canvas, raw } = createFakeCanvas();

    const blob = canvasToPngBlobSync(canvas);

    expect(raw.toDataURL).toHaveBeenCalledWith('image/png');
    expect(blob.type).toBe('image/png');
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([1, 2, 3]);
  });
});

describe('takeChartScreenshotBlobSync', () => {
  it('同步回傳 blob（不經過 promise），並沿用同一組截圖選項', () => {
    const { canvas, raw } = createFakeCanvas();
    const { chart, takeScreenshot } = createFakeChart(canvas);

    const blob = takeChartScreenshotBlobSync(chart, { backgroundColor: null });

    expect(blob).toBeInstanceOf(Blob);
    expect(takeScreenshot).toHaveBeenCalledWith(true, false);
    // 同步路徑不該去碰非同步的 toBlob。
    expect(raw.toBlob).not.toHaveBeenCalled();
  });
});

describe('takeChartScreenshotBlob', () => {
  it('串起截圖與 PNG 編碼', async () => {
    const blob = { type: 'image/png' } as Blob;
    const { canvas } = createFakeCanvas({ blob });
    const { chart, takeScreenshot } = createFakeChart(canvas);

    await expect(takeChartScreenshotBlob(chart, { backgroundColor: null })).resolves.toBe(blob);
    expect(takeScreenshot).toHaveBeenCalledWith(true, false);
  });
});
