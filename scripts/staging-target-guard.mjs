#!/usr/bin/env node
/**
 * Staging-target guard.
 *
 * The local repository is linked to the PRODUCTION Supabase project. Any hosted
 * command that omits `--remote=<ref>` therefore targets production. This guard
 * exists so that can never happen silently.
 *
 *   node scripts/staging-target-guard.mjs
 *       Audit mode. Reports the local link and the required command form.
 *       Never authorises a mutation.
 *
 *   node scripts/staging-target-guard.mjs --target <ref>
 *       Gate mode. Accepts `--target <ref>` and `--target=<ref>`; any other
 *       `--target`-prefixed token is refused rather than ignored.
 *       Exits 0 only when the requested target is exactly staging.
 *       Exits 1 when the target is missing, mismatched, or is production.
 *
 * Reads only `supabase/.temp/project-ref` (git-ignored). Never reads, prints or
 * stores secret values, and never changes the local link.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STAGING_REF = 'gscihjjwhmvddrmcfpxp';
const PRODUCTION_REF = 'wyvsbzcltrhnjeuijsva';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const linkFile = resolve(root, 'supabase', '.temp', 'project-ref');

// Accept both `--target <ref>` and `--target=<ref>`. The equals form must never
// fall through to audit mode: a caller that gates on the exit code would then
// treat a production target as approved. Any other `--target`-prefixed token is
// rejected rather than ignored, so a future spelling cannot silently downgrade.
const argv = [];
const unrecognisedTargetFlags = [];
for (const arg of process.argv.slice(2)) {
  if (arg === '--target') {
    argv.push(arg);
  } else if (arg.startsWith('--target=')) {
    argv.push('--target', arg.slice('--target='.length));
  } else {
    if (arg.startsWith('--target')) unrecognisedTargetFlags.push(arg);
    argv.push(arg);
  }
}
const targetIndex = argv.indexOf('--target');
const requested = targetIndex >= 0 ? argv[targetIndex + 1] : undefined;
const targetFlagPresent = targetIndex >= 0;

function canonicalCommands() {
  return [
    `supabase secrets list   --remote=${STAGING_REF}`,
    `supabase secrets set    --remote=${STAGING_REF} NAME=VALUE`,
    `supabase functions list --remote=${STAGING_REF}`,
    `supabase functions deploy <slug> --project-ref ${STAGING_REF}`,
  ];
}

async function readLinkedRef() {
  try {
    return (await readFile(linkFile, 'utf8')).trim();
  } catch {
    return undefined;
  }
}

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

const linkedRef = await readLinkedRef();

if (unrecognisedTargetFlags.length > 0) {
  fail([
    `REFUSED: unrecognised target flag ${unrecognisedTargetFlags.join(', ')}.`,
    'Use exactly `--target <ref>` or `--target=<ref>`.',
    'Nothing was executed.',
  ]);
}

if (targetFlagPresent) {
  if (!requested || requested.startsWith('-')) {
    fail([
      'REFUSED: --target was given without a project reference.',
      'Nothing was executed.',
    ]);
  }
  if (requested === PRODUCTION_REF) {
    fail([
      `REFUSED: target ${PRODUCTION_REF} is the PRODUCTION project.`,
      'Staging operations must never target production.',
      'Nothing was executed.',
    ]);
  }
  if (requested !== STAGING_REF) {
    fail([
      `REFUSED: target ${requested} is not the staging project.`,
      `Expected exactly: ${STAGING_REF}`,
      'Nothing was executed.',
    ]);
  }
  console.log(`OK: target is staging (${STAGING_REF}).`);
  console.log('Use an explicit --remote on every hosted command:');
  for (const command of canonicalCommands()) console.log(`  ${command}`);
  process.exit(0);
}

console.log('STAGING-TARGET GUARD (audit mode — does not authorise a mutation)');
console.log(`  staging ref    : ${STAGING_REF}`);
console.log(`  production ref : ${PRODUCTION_REF}`);

if (!linkedRef) {
  console.log('  local link     : unreadable (supabase/.temp/project-ref absent)');
  console.log('  status         : cannot confirm the default target');
} else if (linkedRef === PRODUCTION_REF) {
  console.log(`  local link     : ${linkedRef} — PRODUCTION`);
  console.log('  status         : every hosted command MUST pass an explicit --remote');
} else if (linkedRef === STAGING_REF) {
  console.log(`  local link     : ${linkedRef} — staging`);
  console.log('  status         : still pass --remote explicitly; do not rely on the link');
} else {
  console.log(`  local link     : ${linkedRef} — unknown project`);
  console.log('  status         : do not run hosted commands until this is understood');
}

console.log('\nRequired command form:');
for (const command of canonicalCommands()) console.log(`  ${command}`);
console.log('\nRun `node scripts/staging-target-guard.mjs --target <ref>` to gate a mutation.');
