const ALLOWED_HOSTS: Record<string, string> = {
  tpex: 'www.tpex.org.tw',
  yahoo: 'query1.finance.yahoo.com',
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface ProxyTarget {
  host: string;
  pathAndQuery: string;
}

/**
 * '/proxy/tpex?path=/foo?bar=1' -> { host: 'www.tpex.org.tw', pathAndQuery: '/foo?bar=1' }；不在 allowlist 內或缺少 path 回傳 null。
 *
 * 上游路徑透過 `path` query 參數傳遞，而非直接拼在我方路徑上：Deno Deploy 的靜態檔案層會攔截
 * 網址結尾像靜態資源（例如 TPEx 舊版 API 的 `.php`）的請求，直接回平台層 404、根本不會進到這支
 * handler（curl 實測驗證），因此上游路徑不能出現在我方的 pathname 裡。
 */
export function resolveProxyTarget(url: URL): ProxyTarget | null {
  const match = /^\/proxy\/(tpex|yahoo)\/?$/.exec(url.pathname);
  if (!match) {
    return null;
  }

  const path = url.searchParams.get('path');
  if (!path || !path.startsWith('/')) {
    return null;
  }

  const host = ALLOWED_HOSTS[match[1]];
  return { host, pathAndQuery: path };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const target = resolveProxyTarget(url);
  if (!target) {
    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }

  // TPEx/Yahoo 對非瀏覽器請求分別回 302(/errors)/429，需偽裝瀏覽器 header（curl 實測驗證）。
  const upstreamRequest = new Request(`https://${target.host}${target.pathAndQuery}`, {
    method: request.method,
    headers: {
      Accept: request.headers.get('Accept') ?? '*/*',
      'Accept-Language': 'zh-TW,zh;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Referer: `https://${target.host}/`,
    },
    redirect: 'manual',
  });

  const upstreamResponse = await fetch(upstreamRequest);
  return withCors(upstreamResponse);
}
