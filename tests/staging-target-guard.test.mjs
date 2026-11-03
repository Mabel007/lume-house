import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The guard is a process, not a function: its contract is its exit code and its
// printed mode. These tests pin both, so an argument-parsing change cannot
// silently downgrade a refused target into audit mode.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guard = resolve(root, 'scripts', 'staging-target-guard.mjs');

const STAGING = 'gscihjjwhmvddrmcfpxp';
const PRODUCTION = 'wyvsbzcltrhnjeuijsva';
const UNKNOWN = 'aaaaaaaaaaaaaaaaaaaa';

function run(...args) {
  const result = spawnSync(process.execPath, [guard, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function assertStaging(result) {
  assert.equal(result.status, 0);
  assert.match(result.stdout, /OK: target is staging/);
  assert.ok(result.stdout.includes(STAGING));
  assert.doesNotMatch(result.stdout, /audit mode/);
}

function assertRefused(result, pattern) {
  assert.equal(result.status, 1);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stdout, /OK: target is staging/);
}

// --- accepted targets -------------------------------------------------------

test('accepts the staging target in space-separated form', () => {
  assertStaging(run('--target', STAGING));
});

test('accepts the staging target in equals form', () => {
  assertStaging(run(`--target=${STAGING}`));
});

// --- refused targets --------------------------------------------------------

test('refuses the production target in space-separated form', () => {
  assertRefused(run('--target', PRODUCTION), /PRODUCTION project/);
});

test('refuses the production target in equals form', () => {
  // Regression: this previously printed the audit banner and exited 0.
  assertRefused(run(`--target=${PRODUCTION}`), /PRODUCTION project/);
});

test('refuses an unknown target in space-separated form', () => {
  assertRefused(run('--target', UNKNOWN), /not the staging project/);
});

test('refuses an unknown target in equals form', () => {
  assertRefused(run(`--target=${UNKNOWN}`), /not the staging project/);
});

// --- fail-closed argument handling ------------------------------------------

test('refuses a bare --target with no reference', () => {
  assertRefused(run('--target'), /without a project reference/);
});

test('refuses an empty equals-form target', () => {
  assertRefused(run('--target='), /without a project reference/);
});

test('refuses a target that is actually another flag', () => {
  assertRefused(run('--target', '--verbose'), /without a project reference/);
});

test('refuses an unrecognised --target-prefixed flag', () => {
  assertRefused(run(`--targets=${PRODUCTION}`), /unrecognised target flag/);
});

// --- audit mode -------------------------------------------------------------

test('audit mode reports the link without authorising a mutation', () => {
  const result = run();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /audit mode/);
  assert.doesNotMatch(result.stdout, /OK: target is staging/);
  assert.match(result.stdout, /production ref/);
});
