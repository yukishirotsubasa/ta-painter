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

/** '/proxy/tpex/foo?bar=1' -> { host: 'www.tpex.org.tw', pathAndQuery: '/foo?bar=1' }；不在 allowlist 內回傳 null。 */
export function resolveProxyTarget(url: URL): ProxyTarget | null {
  const match = /^\/proxy\/(tpex|yahoo)(\/.*)?$/.exec(url.pathname);
  if (!match) {
    return null;
  }

  const host = ALLOWED_HOSTS[match[1]];
  const path = match[2] ?? '/';
  return { host, pathAndQuery: `${path}${url.search}` };
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
