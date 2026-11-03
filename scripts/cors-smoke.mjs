#!/usr/bin/env node
/**
 * Non-transactional CORS smoke test for the Lumé House staging Edge functions.
 *
 * Verifies the deployed allowlist against the expected contract in
 * `scripts/cors-smoke.config.json` without creating orders, mutating data, or
 * requiring service-role credentials.
 *
 *   npm run cors:smoke
 *   node scripts/cors-smoke.mjs [--config <path>] [--timeout <ms>]
 *
 * Safety properties:
 *   - Only OPTIONS preflights and deliberately UNAUTHENTICATED POSTs are sent.
 *     No Authorization header is ever attached, so either the function returns
 *     401 before it can parse a body, or the platform JWT gate rejects first.
 *   - Read-only: nothing is written anywhere, locally or hosted.
 *   - A failure never rewrites hosted secrets. It exits 1 and reports.
 *
 * Platform nuance: functions declared with `verify_jwt = true` are rejected by
 * the Supabase gateway before the function runs. That 401 carries the gateway's
 * own `sb-error-code` and a wildcard allow-origin, and none of the function's
 * CORS headers. The contract therefore models `verifyJwt` per function.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith('-') ? value : fallback;
};

const configPath = resolve(here, option('--config', 'cors-smoke.config.json'));
const timeoutMs = Number(option('--timeout', '20000'));
const config = JSON.parse(await readFile(configPath, 'utf8'));

const results = [];
const normalize = value => (value ?? '').replace(/\s+/g, '').toLowerCase();

function record(ok, label, detail) {
  results.push({ ok, label });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
}

function note(text) {
  console.log(`NOTE  ${text}`);
}

async function guard(label, run) {
  try {
    await run();
  } catch (error) {
    record(false, label, error instanceof Error ? error.message : String(error));
  }
}

async function call(slug, { method, origin }) {
  const headers = {
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': config.expectedHeaders,
  };
  if (origin) headers.Origin = origin;
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  // No Authorization header, ever: unauthenticated requests are refused before
  // any order or RPC path runs.
  return fetch(`${config.projectUrl}/functions/v1/${slug}`, {
    method,
    headers,
    body: method === 'POST' ? '{}' : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function jsonBody(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function expectAllowed(slug, origin) {
  const response = await call(slug, { method: 'OPTIONS', origin });
  const allowOrigin = response.headers.get('access-control-allow-origin');
  const problems = [];
  if (response.status !== 204) problems.push(`status=${response.status}`);
  if (allowOrigin !== origin) problems.push(`acao=${allowOrigin}`);
  if (normalize(response.headers.get('access-control-allow-methods')) !== normalize(config.expectedMethods)) problems.push(`methods=${response.headers.get('access-control-allow-methods')}`);
  if (normalize(response.headers.get('access-control-allow-headers')) !== normalize(config.expectedHeaders)) problems.push(`headers=${response.headers.get('access-control-allow-headers')}`);
  if (!/origin/i.test(response.headers.get('vary') ?? '')) problems.push(`vary=${response.headers.get('vary')}`);
  if (response.headers.get('cache-control') !== 'no-store') problems.push(`cache=${response.headers.get('cache-control')}`);
  if (response.headers.get('sb-project-ref') !== config.projectRef) problems.push(`project=${response.headers.get('sb-project-ref')}`);
  record(problems.length === 0, `${slug} allows ${origin}`, problems.join(' '));
}

async function expectDenied(slug, origin, label) {
  const response = await call(slug, { method: 'OPTIONS', origin });
  const allowOrigin = response.headers.get('access-control-allow-origin');
  const body = await jsonBody(response);
  const problems = [];
  if (response.status !== 403) problems.push(`status=${response.status}`);
  if (allowOrigin !== null) problems.push(`acao=${allowOrigin}`);
  if (body?.error !== 'ORIGIN_NOT_ALLOWED') problems.push(`error=${body?.error}`);
  record(problems.length === 0, `${slug} denies ${label}`, problems.join(' '));
}

console.log(`CORS SMOKE  project=${config.projectRef}  functions=${config.functions.map(fn => fn.slug).join(',')}\n`);

for (const { slug, verifyJwt } of config.functions) {
  for (const origin of [...config.requiredOrigins, ...config.approvedPreviewOrigins]) {
    await guard(`${slug} allows ${origin}`, () => expectAllowed(slug, origin));
  }
  for (const origin of config.deniedOrigins) {
    await guard(`${slug} denies ${origin}`, () => expectDenied(slug, origin, origin));
  }
  await guard(`${slug} denies unknown origin`, () => expectDenied(slug, config.unknownOrigin, 'unknown origin'));

  // A hosted environment that allows the local-development origin is running on
  // the silent fallback list, i.e. the real allowlist is missing.
  await guard(`${slug} rejects local-development fallback origin`, async () => {
    const response = await call(slug, { method: 'OPTIONS', origin: config.fallbackProbeOrigin });
    record(response.status === 403, `${slug} rejects local-development fallback origin`, `status=${response.status}${response.status === 204 ? ' (default allowlist in effect)' : ''}`);
  });

  await guard(`${slug} OPTIONS without Origin returns 204`, async () => {
    const response = await call(slug, { method: 'OPTIONS' });
    const problems = [];
    if (response.status !== 204) problems.push(`status=${response.status}`);
    if (response.headers.get('access-control-allow-origin') !== null) problems.push('unexpected acao');
    record(problems.length === 0, `${slug} OPTIONS without Origin returns 204`, problems.join(' '));
  });

  if (verifyJwt) {
    // The platform gateway rejects before the function runs, so the function's
    // CORS headers are legitimately absent and a wildcard allow-origin is the
    // gateway's own response, not origin reflection by our code.
    await guard(`${slug} unauthenticated POST is refused by the platform JWT gate`, async () => {
      const response = await call(slug, { method: 'POST', origin: config.requiredOrigins[0] });
      const problems = [];
      if (response.status !== 401) problems.push(`status=${response.status}`);
      if (!response.headers.get('sb-error-code')) problems.push('missing sb-error-code');
      if (response.headers.get('access-control-allow-methods') !== null) problems.push('unexpected function-level cors');
      record(problems.length === 0, `${slug} unauthenticated POST is refused by the platform JWT gate`, problems.join(' '));
      note(`${slug}: gateway 401 carries sb-error-code=${response.headers.get('sb-error-code')} and allow-origin=${response.headers.get('access-control-allow-origin')}; function CORS headers are not reached (expected for verify_jwt=true).`);
    });
    continue;
  }

  await guard(`${slug} unauthenticated POST returns 401`, async () => {
    const response = await call(slug, { method: 'POST' });
    const body = await jsonBody(response);
    const problems = [];
    if (response.status !== 401) problems.push(`status=${response.status}`);
    if (body?.error !== 'AUTH_REQUIRED') problems.push(`error=${body?.error}`);
    record(problems.length === 0, `${slug} unauthenticated POST returns 401`, problems.join(' '));
  });

  await guard(`${slug} allowed origin still requires authentication`, async () => {
    const origin = config.requiredOrigins[0];
    const response = await call(slug, { method: 'POST', origin });
    const body = await jsonBody(response);
    const problems = [];
    if (response.status !== 401) problems.push(`status=${response.status}`);
    if (body?.error !== 'AUTH_REQUIRED') problems.push(`error=${body?.error}`);
    if (response.headers.get('access-control-allow-origin') !== origin) problems.push('acao not echoed');
    record(problems.length === 0, `${slug} allowed origin still requires authentication`, problems.join(' '));
  });
}

const failed = results.filter(result => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log('CORS SMOKE: FAIL');
  process.exit(1);
}
console.log('CORS SMOKE: PASS');
