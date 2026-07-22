/**
 * CORS proxy（Deno Deploy）base URL 與 URL 組裝工具。
 *
 * TPEx／Yahoo 直連會被 CORS 擋，需經 infra2 部署的 proxy 轉發（見 docs/proxy.md）。
 * 上游路徑一律以 `?path=` query 傳遞（避開 Deno Deploy 靜態檔案層攔截 `.php` 等副檔名）。
 */
const PROXY_BASE = 'https://ta-painter.yukishirotsubasa.deno.net';

/**
 * 組出 proxy URL。`upstreamPath` 為上游相對路徑（含 query，必須以 `/` 開頭），
 * 整段做 `encodeURIComponent` 後塞進 `path` 參數。
 */
export function buildProxyUrl(source: 'tpex' | 'yahoo', upstreamPath: string): string {
  return `${PROXY_BASE}/proxy/${source}?path=${encodeURIComponent(upstreamPath)}`;
}
