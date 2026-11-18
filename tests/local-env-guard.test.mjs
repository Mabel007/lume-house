import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The guard is a process, not a function: its contract is its exit code, its
// printed verdict and the promise that env VALUES are never echoed. These
// tests pin all three, so a parsing or reporting change cannot silently
// downgrade a refused production target into a passed launch, or leak a key.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guard = resolve(root, 'scripts', 'local-env-guard.mjs');

const STAGING = 'gscihjjwhmvddrmcfpxp';
const PRODUCTION = 'wyvsbzcltrhnjeuijsva';
const DUMMY_KEY = 'sb_publishable_fixture_not_a_real_key_0000000000000000';

let fixtureDir;

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'lume-local-env-guard-'));
});

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
  fixtureDir = undefined;
});

function fixture(name, lines) {
  writeFileSync(join(fixtureDir, name), lines.join('\n'), 'utf8');
}

function run(...args) {
  const result = spawnSync(process.execPath, [guard, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function assertRefusedProd(result, name) {
  const all = result.stdout + result.stderr;
  assert.equal(result.status, 1);
  assert.match(all, /PRODUCTION project reference/);
  assert.match(all, new RegExp(name));
  // The guard reports file name and line number, never a value:
  assert.doesNotMatch(all, /https:\/\//);
  assert.doesNotMatch(all, /sb_publishable_/);
  assert.doesNotMatch(all, /dev-parity/i);
}

// --- explicit --file mode (fixture-driven) -----------------------------------

test('refuses a VITE_SUPABASE_URL value containing the production reference', () => {
  fixtureName('plain');
  assertRefusedProd(run('--file', rel('plain')), 'plain');
});

test('refuses a double-quoted production value', () => {
  fixture('quoted', [
    '# comment',
    `VITE_SUPABASE_URL="https://${PRODUCTION}.supabase.co" dev-parity`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${DUMMY_KEY}`,
  ]);
  assertRefusedProd(run(`--file=${rel('quoted')}`), 'quoted');
});

test('refuses a single-quoted production value', () => {
  fixture('single', [
    `VITE_SUPABASE_PUBLISHABLE_KEY=${DUMMY_KEY}`,
    `VITE_SUPABASE_URL='https://${PRODUCTION}.supabase.co'`,
  ]);
  assertRefusedProd(run('--file', rel('single')), 'single');
});

function fixtureName(name) {
  fixture(name, [
    '# dev-parity fixture',
    `VITE_SUPABASE_URL=https://${PRODUCTION}.supabase.co dev-parity-realproduction`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${DUMMY_KEY}`,
  ]);
}

test('accepts the staging project reference', () => {
  fixture('staging', [
    '# staging fixture',
    `VITE_SUPABASE_URL=https://${STAGING}.supabase.co`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${DUMMY_KEY}`,
  ]);
  const result = run('--file', rel('staging'));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /OK/);
  assert.match(result.stdout, /does not target the production project/);
  assert.doesNotMatch(result.stdout + result.stderr, /REFUSED/);
  assert.doesNotMatch(result.stdout, /sb_publishable_/);
});

test('accepts a file without a VITE_SUPABASE_URL assignment', () => {
  fixture('nokey', [
    '# other values only',
    `VITE_SUPABASE_PUBLISHABLE_KEY=${DUMMY_KEY}`,
  ]);
  const result = run('--file', rel('nokey'));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /OK/);
});

test('a commented-out production value is not a live value', () => {
  fixture('commented', [
    '# historical note: VITE_SUPABASE_URL=https://wyvs-prod-parity.invalid used here',
    `VITE_SUPABASE_URL=https://${STAGING}.supabase.co`,
  ]);
  const result = run('--file', rel('commented'));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /OK/);
});

test('refuses an explicitly named missing file instead of passing', () => {
  const result = run('--file', rel('absent'));
  const all = result.stdout + result.stderr;
  assert.equal(result.status, 1);
  assert.match(all, /could not be read/);
  assert.match(all, /absent/);
  assert.doesNotMatch(all, /OK/);
  assert.doesNotMatch(all, /sb_publishable_/);
});

// --- fail-closed argument handling -------------------------------------------

test('refuses a bare --file with no path', () => {
  const result = run('--file');
  const all = result.stdout + result.stderr;
  assert.equal(result.status, 1);
  assert.match(all, /--file was given without a path/);
  assert.doesNotMatch(all, /OK/);
});

test('refuses an empty equals-form file', () => {
  const result = run('--file=');
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /--file was given without a path/);
});

test('refuses a file flag that is actually another flag', () => {
  const result = run('--file', '--verbose');
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /--file was given without a path/);
});

test('refuses an unrecognised --file-prefixed flag', () => {
  const result = run('--files=anything');
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /unrecognised file flag/);
});

// --- default mode -------------------------------------------------------------

test('default mode checks the real local chain without leaking values', () => {
  // .env.local currently targets staging (Slice 0 correction). If someone
  // re-points it at production for a session, this test must fail loudly —
  // that is the guard's fail-closed posture, not an inconvenience.
  const result = run();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /OK/);
  assert.doesNotMatch(result.stdout, /sb_publishable_/);
  assert.doesNotMatch(result.stdout + result.stderr, /REFUSED/);
});

function rel(name) {
  return relative(root, resolve(fixtureDir, name)).split('\\').join('/');
}
