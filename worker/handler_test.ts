import { assertEquals } from '@std/assert';
import { resolveProxyTarget } from './handler.ts';

Deno.test('將 /proxy/tpex?path=... 轉為 www.tpex.org.tw 並保留 path 內含的路徑與 query', () => {
  const url = new URL(
    'https://worker.example.com/proxy/tpex?path=' +
      encodeURIComponent('/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?d=113/09'),
  );
  assertEquals(resolveProxyTarget(url), {
    host: 'www.tpex.org.tw',
    pathAndQuery: '/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?d=113/09',
  });
});

Deno.test('將 /proxy/yahoo?path=... 轉為 query1.finance.yahoo.com', () => {
  const url = new URL(
    'https://worker.example.com/proxy/yahoo?path=' + encodeURIComponent('/v8/finance/chart/2330.TW'),
  );
  assertEquals(resolveProxyTarget(url), {
    host: 'query1.finance.yahoo.com',
    pathAndQuery: '/v8/finance/chart/2330.TW',
  });
});

Deno.test('缺少 path 參數回傳 null', () => {
  assertEquals(resolveProxyTarget(new URL('https://worker.example.com/proxy/tpex')), null);
  assertEquals(resolveProxyTarget(new URL('https://worker.example.com/proxy/tpex?path=')), null);
});

Deno.test('path 不是以 / 開頭時回傳 null（避免變成任意目標）', () => {
  const url = new URL(
    'https://worker.example.com/proxy/tpex?path=' + encodeURIComponent('https://evil.example.com/'),
  );
  assertEquals(resolveProxyTarget(url), null);
});

Deno.test('不在 allowlist 內的路徑回傳 null（不接受任意目標）', () => {
  assertEquals(resolveProxyTarget(new URL('https://worker.example.com/proxy/evil?path=/foo')), null);
  assertEquals(resolveProxyTarget(new URL('https://worker.example.com/')), null);
});
