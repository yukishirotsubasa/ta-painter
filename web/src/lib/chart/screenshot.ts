import type { IChartApi } from 'lightweight-charts';

/**
 * 圖表截圖（share3）：把 `IChartApi.takeScreenshot()` 產出的 canvas 補上底色後轉成 PNG blob，
 * 供之後的剪貼簿複製（share4）與 Web Share／下載（share5）共用。
 *
 * 關於 `addTopLayer`（設計文件待驗證項目 2）：
 * lightweight-charts 每個 pane 有兩張 canvas——主畫布與 top 畫布。primitive 的 pane view 依
 * `zOrder()` 決定畫在哪張：`'normal'`（未實作 `zOrder()` 時的預設，`TrendLinePrimitive` 即是）畫在
 * **主畫布**，只有 `'top'` 與十字準星畫在 top 畫布。而 `takeScreenshot()` 一定會合成主畫布，
 * `addTopLayer` 只決定要不要再疊上 top 畫布。
 * 也就是說手繪趨勢線本來就會被截入，不需要 offscreen canvas 疊繪的備案；`addTopLayer` 預設仍開著，
 * 讓日後新增 `zOrder: 'top'` 的 primitive 也一併截入。
 *
 * `includeCrosshair` 只在 `addTopLayer` 開啟時有意義：函式庫的作法是截圖期間暫時把
 * `crosshair.mode` 切成 `Hidden`，截完再還原，因此關掉時 top 畫布上不會有準星殘影。
 */

/**
 * `ChartContainer` 的 `layout.background` 是 `transparent`（讓圖表吃頁面底色），
 * 截圖沿用同一組繪製流程，主畫布的底色也會是透明的。PNG 保留 alpha，貼到不處理透明度的
 * 軟體（多數聊天軟體、簡報）會變成黑底，因此截圖一律補上頁面底色。
 */
const FALLBACK_BACKGROUND_COLOR = '#16171d';
const FALLBACK_TEXT_COLOR = '#f3f4f6';

/** 標題列（股票名稱與代號）的 CSS 尺寸；實際繪製時乘上 devicePixelRatio，與圖表 canvas 同比例。 */
const HEADER_HEIGHT_CSS = 34;
const HEADER_FONT_CSS = 17;
const HEADER_PADDING_CSS = 12;
const HEADER_FONT_STACK = "system-ui, 'Segoe UI', Roboto, sans-serif";

export interface ChartScreenshotOptions {
  /** 是否疊上 top 畫布（十字準星與 `zOrder: 'top'` 的 primitive 所在層）。 */
  addTopLayer?: boolean;
  /** 是否保留十字準星；僅在 `addTopLayer` 開啟時有效。 */
  includeCrosshair?: boolean;
  /** 補在圖表底下的底色；傳 `null` 保留透明背景。省略時取頁面的 `--bg`。 */
  backgroundColor?: string | null;
  /** 在圖表上方加一條標題列文字（例：`台積電 2330`）；省略或空字串則不加。 */
  headerLabel?: string;
}

/** 讀目前主題的頁面底色（`index.css` 的 `--bg`，深色模式由 media query 覆寫）。 */
export function resolvePageBackgroundColor(): string {
  if (typeof document === 'undefined') return FALLBACK_BACKGROUND_COLOR;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  return value || FALLBACK_BACKGROUND_COLOR;
}

/** 讀目前主題的標題文字色（`index.css` 的 `--text-h`）；供標題列用。 */
export function resolvePageHeadingColor(): string {
  if (typeof document === 'undefined') return FALLBACK_TEXT_COLOR;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--text-h').trim();
  return value || FALLBACK_TEXT_COLOR;
}

export interface HeaderLabelStyle {
  /** 標題列底色（一般與截圖底色相同）。 */
  backgroundColor: string;
  /** 標題文字色。 */
  textColor: string;
  /** 相對 CSS 尺寸的縮放（devicePixelRatio），讓標題與圖表同比例、高 DPI 下字不會太小。 */
  scale: number;
}

/**
 * 把圖表 canvas 疊到一張「頂部多一條標題列」的新 canvas 上並回傳（見 `docs/share.md` 的「標題列」）。
 * 依 technical-debt 維護守則，截圖後處理集中在 `takeChartScreenshotCanvas`，同步／非同步兩條路徑共用。
 * 取不到 2d context 時退回原圖（不因加標題失敗而讓整個截圖失敗）。
 */
export function composeWithHeaderLabel(
  chartCanvas: HTMLCanvasElement,
  label: string,
  { backgroundColor, textColor, scale }: HeaderLabelStyle,
): HTMLCanvasElement {
  const headerHeight = Math.round(HEADER_HEIGHT_CSS * scale);
  const out = document.createElement('canvas');
  out.width = chartCanvas.width;
  out.height = chartCanvas.height + headerHeight;

  const ctx = out.getContext('2d');
  if (!ctx) return chartCanvas;

  // 整張鋪底色（含標題列與圖表區）：圖表若保留透明，底色會透出來，與 fillCanvasBackground 的效果一致。
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(chartCanvas, 0, headerHeight);

  ctx.fillStyle = textColor;
  ctx.font = `600 ${Math.round(HEADER_FONT_CSS * scale)}px ${HEADER_FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, Math.round(HEADER_PADDING_CSS * scale), Math.round(headerHeight / 2));

  return out;
}

/**
 * 在既有 canvas 的內容「底下」填色（`destination-over`），不需要另開一張 canvas 疊繪。
 * 取不到 2d context 時直接放棄補底色，維持透明背景而非讓整個截圖失敗。
 */
export function fillCanvasBackground(canvas: HTMLCanvasElement, color: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/** 截圖並補底色，回傳 canvas（供白箱驗證直接取像素；一般使用請用 `takeChartScreenshotBlob`）。 */
export function takeChartScreenshotCanvas(
  chart: IChartApi,
  { addTopLayer = true, includeCrosshair = false, backgroundColor, headerLabel }: ChartScreenshotOptions = {},
): HTMLCanvasElement {
  const canvas = chart.takeScreenshot(addTopLayer, includeCrosshair);
  const background = backgroundColor === undefined ? resolvePageBackgroundColor() : backgroundColor;
  if (background !== null) fillCanvasBackground(canvas, background);

  // 標題列疊在補完底色之後：此時圖表區已不透明，標題列另取底色鋪滿。
  if (headerLabel) {
    const scale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return composeWithHeaderLabel(canvas, headerLabel, {
      backgroundColor: background ?? FALLBACK_BACKGROUND_COLOR,
      textColor: resolvePageHeadingColor(),
      scale,
    });
  }

  return canvas;
}

/** `canvas.toBlob()` 的 promise 版；瀏覽器回 `null`（編碼失敗）時 reject 而非給出 `null` blob。 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob() 產生截圖失敗'));
    }, 'image/png');
  });
}

/** 截圖並轉成 PNG blob。 */
export function takeChartScreenshotBlob(chart: IChartApi, options?: ChartScreenshotOptions): Promise<Blob> {
  return canvasToPngBlob(takeChartScreenshotCanvas(chart, options));
}

/**
 * `canvasToPngBlob()` 的同步版（share5）：`toDataURL()` 是同步 API，base64 自行解成 bytes 組 Blob。
 *
 * 為什麼需要同步版：`navigator.share()` 不像 `ClipboardItem` 可以吃 promise，而且對 transient
 * user activation 很嚴格（iOS Safari 尤其）。有了同步版，click handler 內就能一路同步拿到檔案再呼叫
 * `share()`，中間完全沒有 await。代價是編碼會擋住主執行緒（PNG 約百 KB 等級，使用者主動觸發，可接受）。
 */
export function canvasToPngBlobSync(canvas: HTMLCanvasElement): Blob {
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

/** 截圖並同步轉成 PNG blob（share5 的 Web Share 路徑用）。 */
export function takeChartScreenshotBlobSync(chart: IChartApi, options?: ChartScreenshotOptions): Blob {
  return canvasToPngBlobSync(takeChartScreenshotCanvas(chart, options));
}
