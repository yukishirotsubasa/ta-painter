import { assertEquals } from '@std/assert';
import { resolveProxyTarget } from './handler.ts';

Deno.test('將 /proxy/tpex/... 轉為 www.tpex.org.tw 並保留路徑與 query', () => {
  const url = new URL(
    'https://worker.example.com/proxy/tpex/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?d=113/09',
  );
  assertEquals(resolveProxyTarget(url), {
    host: 'www.tpex.org.tw',
    pathAndQuery: '/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?d=113/09',
  });
});

Deno.test('將 /proxy/yahoo/... 轉為 query1.finance.yahoo.com', () => {
  const url = new URL('https://worker.example.com/proxy/yahoo/v8/finance/chart/2330.TW');
  assertEquals(resolveProxyTarget(url), {
    host: 'query1.finance.yahoo.com',
    pathAndQuery: '/v8/finance/chart/2330.TW',
  });
});

Deno.test('無子路徑時導向 host 根目錄', () => {
  const url = new URL('https://worker.example.com/proxy/tpex');
  assertEquals(resolveProxyTarget(url), { host: 'www.tpex.org.tw', pathAndQuery: '/' });
});

Deno.test('不在 allowlist 內的路徑回傳 null（不接受任意目標）', () => {
  assertEquals(resolveProxyTarget(new URL('https://worker.example.com/proxy/evil/foo')), null);
  assertEquals(resolveProxyTarget(new URL('https://worker.example.com/')), null);
  assertEquals(resolveProxyTarget(new URL('https://worker.example.com/proxy')), null);
});
