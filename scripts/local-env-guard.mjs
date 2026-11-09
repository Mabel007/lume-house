#!/usr/bin/env node
/**
 * Local-env guard for developer entry points.
 *
 * `.env.local` is git-ignored and silently seeds `npm run dev`, `npm run
 * preview` and `npm run build` through Vite's default env loading. A
 * mis-scoped value therefore points a local browser session at the PRODUCTION
 * Supabase project (real customer data) — the state this repository
 * historically had until the Slice 0 environment-isolation correction. This
 * guard exists so that can never happen silently again:
 *
 *   node scripts/local-env-guard.mjs
 *       Check every local Vite env file that exists (.env.local,
 *       .env.development.local, .env.production.local). Exits 0 when none of
 *       them carries the production project reference in VITE_SUPABASE_URL.
 *
 *   node scripts/local-env-guard.mjs --file <path>
 *       Check exactly one file, relative to the repository root. Used by tests
 *       and audits for controlled fixtures; a missing explicit file is refused
 *       rather than treated as a pass.
 *
 * Like scripts/staging-target-guard.mjs, it accepts both `--file <path>` and
 * `--file=<path>`, refuses any other --file-prefixed token instead of ignoring
 * it, and never reads, prints or stores secret values: only file names and
 * line numbers are reported. It never modifies or moves a file. A missing
 * .env.local in default mode passes: the runtime configuration guard in
 * src/lib/supabase/config.ts already fails closed when the browser cannot
 * configure a valid client.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STAGING_REF = 'gscihjjwhmvddrmcfpxp';
const PRODUCTION_REF = 'wyvsbzcltrhnjeuijsva';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FILES = [
  '.env.local',
  '.env.development.local',
  '.env.production.local',
];

const argv = [];
const unrecognisedFileFlags = [];
let fileFlagSeen = false;
let requested = undefined;
for (let i = 0; i < process.argv.slice(2).length; i++) {
  const arg = process.argv.slice(2)[i];
  if (arg === '--file') {
    fileFlagSeen = true;
    const next = process.argv.slice(2)[i + 1];
    if (next !== undefined) {
      argv.push(next);
      i++;
    }
  } else if (arg.startsWith('--file=')) {
    fileFlagSeen = true;
    requested = arg.slice('--file='.length);
  } else {
    if (arg.startsWith('--file')) unrecognisedFileFlags.push(arg);
    argv.push(arg);
  }
}
if (fileFlagSeen && requested === undefined) {
  const spaced = argv[argv.length - 1];
  if (spaced !== undefined && !spaced.startsWith('-')) requested = spaced;
}

function stripQuoting(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

async function findOffenses(path) {
  const text = await readFile(path, 'utf8');
  const offenses = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^VITE_SUPABASE_URL\s*=\s*(.*)$/);
    if (!match) continue;
    const value = stripQuoting(match[1]);
    if (value.includes(PRODUCTION_REF)) {
      offenses.push({ path, line: index + 1 });
    }
  }
  return offenses;
}

if (unrecognisedFileFlags.length > 0) {
  fail([
    `REFUSED: unrecognised file flag ${unrecognisedFileFlags.join(', ')}.`,
    'Use exactly `--file <path>`, `--file=<path>`, or no --file at all.',
    'Nothing was checked.',
  ]);
}

if (fileFlagSeen && (!requested || requested.startsWith('-'))) {
  fail([
    'REFUSED: --file was given without a path.',
    'Nothing was checked.',
  ]);
}

if (requested !== undefined) {
  const explicit = resolve(root, requested);
  let offenses;
  try {
    offenses = await findOffenses(explicit);
  } catch {
    fail([
      `REFUSED: explicit file ${requested} could not be read.`,
      'A named file must exist when --file is used. Nothing was checked.',
    ]);
  }
  if (offenses.length > 0) {
    fail([
      `REFUSED: ${requested} (line ${offenses[0].line}) contains the`,
      `PRODUCTION project reference (${PRODUCTION_REF}) in VITE_SUPABASE_URL.`,
      'Local development, preview and build must target the staging project.',
      'Nothing was executed.',
    ]);
  }
  console.log(`OK: ${requested} does not target the production project.`);
  console.log(`  staging ref    : ${STAGING_REF}`);
  console.log(`  production ref : ${PRODUCTION_REF} (the only refused target)`);
  process.exit(0);
}

const offenses = [];
const checked = [];
for (const name of DEFAULT_FILES) {
  const path = resolve(root, name);
  try {
    const found = await findOffenses(path);
    checked.push(name);
    offenses.push(...found);
  } catch {
    // Missing or unreadable default files are skipped; config.ts fails closed
    // at runtime when the browser cannot configure a valid client.
  }
}

if (offenses.length > 0) {
  fail([
    `REFUSED: ${offenses.map((o) => `${o.path} (line ${o.line})`).join('; ')} contains the`,
    `PRODUCTION project reference (${PRODUCTION_REF}) in VITE_SUPABASE_URL.`,
    'Vite loads this file into `npm run dev`, `npm run preview` and',
    '`npm run build`: a local session would read and write real customer data.',
    'Local development must target the staging project.',
    'Nothing was executed.',
  ]);
}

console.log(
  `OK: local Vite env files (${checked.join(', ') || 'none present'}) do not target the production project.`,
);
console.log(`  staging ref    : ${STAGING_REF}`);
console.log(`  production ref : ${PRODUCTION_REF} (the only refused target)`);
