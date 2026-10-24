import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins } from '../supabase/functions/_shared/cors.ts';
import { commerceHandler } from '../supabase/functions/_shared/handler.ts';

const staging = 'https://gscihjjwhmvddrmcfpxp.supabase.co';
const production = 'https://wyvsbzcltrhnjeuijsva.supabase.co';
const original = 'https://original.example.invalid';
const extra = 'https://lume-house-git-feat-lume-web-b2-1-a-direct-order-najbuilds.vercel.app';
const previousDeno = globalThis.Deno;
after(() => { globalThis.Deno = previousDeno; });

test('legacy comma-separated origins retain exact entries and whitespace handling', () => {
  assert.deepEqual(allowedOrigins(` ${original}, http://localhost:5173, ,${original}`, undefined, staging), [original, 'http://localhost:5173']);
  // Do not reinterpret or normalize the unknown existing configuration.
  assert.deepEqual(allowedOrigins('https://Legacy.invalid/,opaque-legacy-entry', '', staging), ['https://Legacy.invalid/', 'opaque-legacy-entry']);
});

test('supplemental origins are additive, comma-separated and deduplicated', () => {
  assert.deepEqual(allowedOrigins(original, ` ${extra}, http://localhost:5198,${original},${extra} `, staging), [original, extra, 'http://localhost:5198']);
});

test('missing, empty or malformed supplemental entries never widen the allowlist', () => {
  for (const value of [undefined, '', ' , , ', '*', 'null', 'undefined', 'https://*.example.invalid', 'https://web.invalid/path', 'https://web.invalid/', 'https://web.invalid?query=1', 'https://web.invalid#fragment', 'https://user:password@web.invalid', 'javascript:alert(1)', 'data:text/plain,hello', 'not-an-origin', '//web.invalid', 'https://UPPER.invalid', 'https://web.invalid:443']) {
    assert.deepEqual(allowedOrigins(original, value, staging), [original]);
  }
  assert.deepEqual(allowedOrigins(original, `*,${extra},https://bad.invalid/path`, staging), [original, extra]);
});

test('supplemental configuration is ignored outside the explicit staging project', () => {
  for (const url of [production, undefined, '', 'http://127.0.0.1:54321', staging + '/', staging + '.invalid']) {
    assert.deepEqual(allowedOrigins(original, extra, url), [original]);
  }
});

async function handlers(projectUrl = staging, supplemental, primary) {
  if (arguments.length < 2) supplemental = extra;
  if (arguments.length < 3) primary = original;
  let media;
  const env = { SUPABASE_URL: projectUrl, SUPABASE_ANON_KEY: 'synthetic-public', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', ALLOWED_ORIGINS: primary, ALLOWED_ORIGINS_EXTRA: supplemental };
  globalThis.Deno = { env: { get: name => env[name] }, serve: handler => { media = handler; } };
  // Exercise the actual media entry point rather than duplicating its configuration.
  await import(`../supabase/functions/product-media/index.ts?cors=${crypto.randomUUID()}`);
  return [...['place', 'direct', 'email'].map(mode => ({ name: mode, handler: commerceHandler(mode), methods: ['POST', 'OPTIONS'] })), { name: 'media', handler: media, methods: ['GET', 'POST', 'OPTIONS'] }];
}

function preflight(origin) {
  return new Request('https://edge.example.invalid', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,apikey,content-type,x-client-info' } });
}

test('all four deployed entry points accept original and supplemental preflight with exact headers', async () => {
  for (const { name, handler, methods } of await handlers()) {
    for (const origin of [original, extra]) {
      const response = await handler(preflight(origin));
      assert.equal(response.status, 204, name);
      assert.equal(response.headers.get('access-control-allow-origin'), origin, name);
      assert.equal(response.headers.get('vary'), 'Origin', name);
      assert.equal(response.headers.get('cache-control'), 'no-store', name);
      assert.deepEqual(response.headers.get('access-control-allow-methods').split(','), methods, name);
      assert.deepEqual(response.headers.get('access-control-allow-headers').split(','), ['authorization', 'apikey', 'content-type', 'x-client-info'], name);
    }
  }
});

test('all four entry points reject unknown, malformed and suffix-confusable origins without reflection', async () => {
  for (const { name, handler } of await handlers(staging, `*,null,${extra},https://bad.invalid/path`)) {
    for (const origin of ['https://unknown.invalid', extra + '.invalid', extra + '/', original + '.invalid', 'null', '*', 'https://bad.invalid']) {
      const response = await handler(preflight(origin));
      assert.equal(response.status, 403, name);
      assert.equal(response.headers.get('access-control-allow-origin'), null, name);
      assert.equal((await response.json()).error, 'ORIGIN_NOT_ALLOWED', name);
    }
  }
});

test('empty supplemental configuration preserves original-only behavior across all entry points', async () => {
  for (const supplemental of [undefined, '', ' , ', '*,not-an-origin']) {
    for (const { name, handler } of await handlers(staging, supplemental)) {
      assert.equal((await handler(preflight(original))).status, 204, name);
      assert.equal((await handler(preflight(extra))).status, 403, name);
    }
  }
});

test('production ignores supplemental origins and allowed origins do not bypass authentication', async () => {
  for (const { name, handler } of await handlers(production)) {
    assert.equal((await handler(preflight(original))).status, 204, name);
    assert.equal((await handler(preflight(extra))).status, 403, name);
  }
  for (const { name, handler } of await handlers()) {
    const response = await handler(new Request('https://edge.example.invalid', { method: 'POST', headers: { Origin: extra, 'Content-Type': 'application/json' }, body: '{}' }));
    assert.equal(response.status, 401, name);
    assert.equal((await response.json()).error, 'AUTH_REQUIRED', name);
  }
});

test('commerce defaults and media empty-list behavior are preserved when the original setting is absent', async () => {
  for (const { name, handler } of await handlers(staging, undefined, undefined)) {
    assert.equal((await handler(preflight('http://localhost:5173'))).status, name === 'media' ? 403 : 204, name);
    assert.equal((await handler(preflight('https://unknown.invalid'))).status, 403, name);
  }
});
