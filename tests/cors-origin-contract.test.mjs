import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins } from '../supabase/functions/_shared/cors.ts';
import { commerceHandler } from '../supabase/functions/_shared/handler.ts';

// Canonical identities. These are contract values, not fixtures: changing one is
// a deliberate policy change that must also update docs/cors-origin-contract.md
// and scripts/cors-smoke.config.json.
const STAGING = 'https://gscihjjwhmvddrmcfpxp.supabase.co';
const PRODUCTION = 'https://wyvsbzcltrhnjeuijsva.supabase.co';
const STOREFRONT = 'https://lume.najbuilds.com';
const S02 = 'https://lume-house-git-feat-lume-web-s02-country-enforcement-najbuilds.vercel.app';
const APPROVED_PREVIEW = 'https://lume-house-cucv9kk4a-najbuilds.vercel.app';
const LEGACY = 'https://legacy-origin.example.invalid';
const DEFAULTS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'https://lume-house-delta.vercel.app',
];

const previousDeno = globalThis.Deno;
after(() => { globalThis.Deno = previousDeno; });

function setEnv(env) {
  globalThis.Deno = { env: { get: name => env[name] } };
}

function preflight(origin) {
  return new Request('https://edge.example.invalid', {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,apikey,content-type,x-client-info' },
  });
}

function post(origin) {
  return new Request('https://edge.example.invalid', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: '{}',
  });
}

test('staging identity is matched exactly and never by prefix or case', () => {
  assert.deepEqual(allowedOrigins(LEGACY, S02, STAGING), [LEGACY, S02]);
  for (const url of [STAGING + '/', STAGING + '.invalid', STAGING.toUpperCase(), 'http://gscihjjwhmvddrmcfpxp.supabase.co', undefined, '']) {
    assert.deepEqual(allowedOrigins(LEGACY, S02, url), [LEGACY], `must ignore supplemental for ${url}`);
  }
});

test('production injects exactly the canonical storefront and ignores supplemental', () => {
  assert.deepEqual(allowedOrigins(LEGACY, S02, PRODUCTION), [LEGACY, STOREFRONT]);
  assert.deepEqual(allowedOrigins(`${LEGACY},${STOREFRONT}`, S02, PRODUCTION), [LEGACY, STOREFRONT]);
  assert.deepEqual(allowedOrigins(LEGACY, `${S02},${APPROVED_PREVIEW}`, PRODUCTION), [LEGACY, STOREFRONT]);
});

test('staging never inherits the production storefront', () => {
  assert.deepEqual(allowedOrigins(LEGACY, undefined, STAGING), [LEGACY]);
  assert.deepEqual(allowedOrigins(LEGACY, '', STAGING), [LEGACY]);
});

test('supplemental list is comma-separated, trimmed, exact and deduplicated', () => {
  assert.deepEqual(allowedOrigins(LEGACY, ` ${S02} , ${APPROVED_PREVIEW} ,${S02},, `, STAGING), [LEGACY, S02, APPROVED_PREVIEW]);
  assert.deepEqual(allowedOrigins(LEGACY, `*,${S02},https://bad.invalid/path`, STAGING), [LEGACY, S02]);
});

test('drifted supplemental entries grant nothing', () => {
  const drifted = [
    S02 + '/',
    `"${S02}"`,
    `${S02}/auth/callback`,
    `${S02}?query=1`,
    `${S02}#fragment`,
    'https://*.vercel.app',
    '*',
    'null',
    'undefined',
    'not-an-origin',
    `https://user:password@lume-house-cucv9kk4a-najbuilds.vercel.app`,
    S02.toUpperCase(),
    `${S02}:443`,
    'javascript:alert(1)',
  ];
  for (const value of drifted) {
    assert.deepEqual(allowedOrigins(LEGACY, value, STAGING), [LEGACY], `must reject ${value}`);
  }
});

test('commerce default fallback is explicit and closed', async () => {
  const handler = commerceHandler('place');
  // No ALLOWED_ORIGINS: the documented local-development list is in effect.
  setEnv({ SUPABASE_URL: STAGING });
  for (const origin of DEFAULTS) {
    assert.equal((await handler(preflight(origin))).status, 204, origin);
  }
  for (const origin of ['http://localhost:5175', STOREFRONT, S02, APPROVED_PREVIEW, 'https://unknown.invalid']) {
    assert.equal((await handler(preflight(origin))).status, 403, origin);
  }
});

test('an empty ALLOWED_ORIGINS silently falls back — detected, not prevented', async () => {
  // Current behaviour uses `||`, so an empty secret falls back to the local list
  // instead of failing closed. This test pins that behaviour so the gap stays
  // visible; scripts/cors-smoke.mjs fails when a hosted environment exhibits it.
  const handler = commerceHandler('place');
  setEnv({ SUPABASE_URL: STAGING, ALLOWED_ORIGINS: '' });
  assert.equal((await handler(preflight('http://localhost:5173'))).status, 204);
});

test('configured allowlist replaces the fallback entirely', async () => {
  const handler = commerceHandler('place');
  setEnv({ SUPABASE_URL: STAGING, ALLOWED_ORIGINS: LEGACY, ALLOWED_ORIGINS_EXTRA: S02 });
  assert.equal((await handler(preflight(LEGACY))).status, 204);
  assert.equal((await handler(preflight(S02))).status, 204);
  for (const origin of DEFAULTS) {
    assert.equal((await handler(preflight(origin))).status, 403, origin);
  }
});

test('denied origins are refused without reflection on both checkout entry points', async () => {
  for (const mode of ['place', 'direct']) {
    const handler = commerceHandler(mode);
    setEnv({ SUPABASE_URL: STAGING, ALLOWED_ORIGINS: LEGACY, ALLOWED_ORIGINS_EXTRA: S02 });
    for (const origin of ['https://unknown.invalid', S02 + '.invalid', S02 + '/', 'null', '*']) {
      const response = await handler(preflight(origin));
      assert.equal(response.status, 403, `${mode} ${origin}`);
      assert.equal(response.headers.get('access-control-allow-origin'), null, `${mode} ${origin}`);
      assert.equal((await response.json()).error, 'ORIGIN_NOT_ALLOWED', `${mode} ${origin}`);
    }
  }
});

test('an allowed origin still cannot bypass authentication', async () => {
  for (const mode of ['place', 'direct']) {
    const handler = commerceHandler(mode);
    setEnv({ SUPABASE_URL: STAGING, ALLOWED_ORIGINS: LEGACY, ALLOWED_ORIGINS_EXTRA: S02 });
    const response = await handler(post(S02));
    assert.equal(response.status, 401, mode);
    assert.equal(response.headers.get('access-control-allow-origin'), S02, mode);
    assert.equal((await response.json()).error, 'AUTH_REQUIRED', mode);
  }
});
