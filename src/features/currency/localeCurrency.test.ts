import assert from 'node:assert/strict';
import { test, before, after, afterEach, mock } from 'node:test';
before(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-23T12:00:00Z') }));
after(() => mock.timers.reset());

// Minimal localStorage polyfill matching currency.test.ts, plus a throw-mode
// switch so "storage unavailable" is exercised without touching real storage.
const store: Record<string, string> = {};
let failing = false;
const localStoragePolyfill = {
  getItem: (k: string) => { if (failing) throw new Error('storage unavailable'); return k in store ? store[k] : null; },
  setItem: (k: string, v: string) => { if (failing) throw new Error('storage unavailable'); store[k] = String(v); },
  removeItem: (k: string) => { if (failing) throw new Error('storage unavailable'); delete store[k]; },
  clear: () => { if (failing) throw new Error('storage unavailable'); for (const key of Object.keys(store)) delete store[key]; },
};
(globalThis as unknown as { localStorage: Storage }).localStorage = localStoragePolyfill as unknown as Storage;

import { CURRENCY_STORAGE_KEY, isSupportedCurrency, readCurrencyPreference, readStoredCurrencyPreference, writeCurrencyPreference } from './currency.ts';
import { browserLocales, currencyForBrowser, detectCurrencyForLocales, initialCurrencyPreference, REGION_DISPLAY_CURRENCY } from './localeCurrency.ts';

const stubWithThrowingStorage = () => { failing = true; };
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
function stubNavigator(locales: unknown): void {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locales });
}
afterEach(() => {
  failing = false;
  for (const key of Object.keys(store)) delete store[key];
  // Restore the real Node navigator descriptor (getter) after each test.
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete (globalThis as { navigator?: unknown }).navigator;
});

test('the supported region mapping covers exactly SL, GN, GH, NG and US', () => {
  assert.deepEqual(Object.keys(REGION_DISPLAY_CURRENCY).sort(), ['GH', 'GN', 'NG', 'SL', 'US']);
  assert.equal(REGION_DISPLAY_CURRENCY['SL'], 'NLE');
  assert.equal(REGION_DISPLAY_CURRENCY['GN'], 'GNF');
  assert.equal(REGION_DISPLAY_CURRENCY['GH'], 'GHS');
  assert.equal(REGION_DISPLAY_CURRENCY['NG'], 'NGN');
  assert.equal(REGION_DISPLAY_CURRENCY['US'], 'USD');
});

test('documented locale examples resolve by explicit region subtag', () => {
  for (const [tag, expected] of [
    ['sl-SL', 'NLE'], ['en-SL', 'NLE'], ['sl_SL', 'NLE'], ['sl-sl', 'NLE'],
    ['en-US', 'USD'], ['en-us', 'USD'], ['en_US', 'USD'],
    ['fr-GN', 'GNF'], ['gn_GN', 'GNF'], ['en-GH', 'GHS'], ['ig-NG', 'NGN'],
    ['en-US-POSIX', 'USD'], ['en-US-u-ca-gregory', 'USD'], ['sr-Latn-RS', null], ['zh-Hans-CN', null],
  ] as const) {
    assert.equal(detectCurrencyForLocales([tag]), expected, tag);
  }
});

test('language-only, unknown and malformed tags never decide a currency', () => {
  for (const tag of ['en', 'sl', 'fr', 'und', ' Und ', 'abcd-XY', '!!!', '', '123-US', 'x-private', 'en-x-private', 'en-u-sd-sl', 'zh-Hant']) {
    assert.equal(detectCurrencyForLocales([tag]), null, tag);
  }
  assert.equal(detectCurrencyForLocales([undefined, null, { languages: 'en-US' }]), null);
});

test('malformed suffixes and duplicated subtags reject the whole tag before any region is read', () => {
  // Incomplete Unicode-language extension or private-use suffixes are
  // invalid complete tags, even though their leading 'en-US' region is
  // supported: the region may no longer be selected ahead of validation.
  for (const tag of ['en-US-u', 'en-US-x', 'en-US-!', 'en-US-x-lvariant', 'en-x', 'en-u', 'en--US', 'sl-']) {
    assert.equal(detectCurrencyForLocales([tag]), null, tag);
  }
  // A repeated region or script subtag invalidates the whole tag — the
  // earlier subtag must not win by position ('en-US-NG' is NG malformed, not
  // a US decision).
  for (const tag of ['en-US-NG', 'en-us-us', 'sl-SL-SL', 'en-GB-en', 'en-Latn-Latn-US']) {
    assert.equal(detectCurrencyForLocales([tag]), null, tag);
  }
  // A rejected tag is skipped, never a scan-stopper: later explicit regions
  // still decide in preference order.
  assert.equal(detectCurrencyForLocales(['en-US-u', 'fr-NG']), 'NGN');
  assert.equal(detectCurrencyForLocales(['en-Latn-Latn-US', 'sl-SL']), 'NLE');
  assert.equal(detectCurrencyForLocales(['en-us-us', 'en-US']), 'USD');
});

test('valid extension and script tags keep resolving their region exactly once', () => {
  for (const [tag, expected] of [
    ['en-US-e-abc', 'USD'],
    ['en-SL-u-ca-gregory', 'NLE'],
    ['sl-Latn-SL', 'NLE'],
    ['en-x-priv-test', null], // valid private-use tag, but no region follows
    ['ig-NG', 'NGN'],
  ] as const) {
    assert.equal(detectCurrencyForLocales([tag]), expected, tag);
  }
});

test('an unsupported region contributes nothing but does not block later explicit regions', () => {
  // A lone unsupported region leaves the decision to the NLE fallback.
  for (const tag of ['fr-FR', 'de-DE', 'en-GB', 'en-419', 'zh-Hant-TW']) {
    assert.equal(detectCurrencyForLocales([tag]), null, tag);
  }
  // Ordered scan: a later tag with a supported mapping is honoured.
  assert.equal(detectCurrencyForLocales(['fr-FR', 'sl-SL']), 'NLE');
  assert.equal(detectCurrencyForLocales(['en-GB', 'en-US']), 'USD');
  // A language-only tag is skipped rather than treated as a decision.
  assert.equal(detectCurrencyForLocales(['en', 'sl-SL']), 'NLE');
});

test('currencyForBrowser follows the languages order and falls back to the primary locale then NLE', () => {
  assert.equal(currencyForBrowser({ languages: ['en-GB', 'fr-NG'], language: 'fr-GH' }), 'NGN');
  assert.equal(currencyForBrowser({ languages: [], language: 'fr-GH' }), 'GHS');
  assert.equal(currencyForBrowser({ languages: ['en'], language: 'en' }), 'NLE');
  assert.equal(currencyForBrowser({ languages: [], language: undefined }), 'NLE');
  assert.equal(currencyForBrowser(undefined), 'NLE');
});

test('browserLocales reads only the Intl preferences the browser exposes', () => {
  stubNavigator({ languages: ['ng-NG', 42], language: 'fr' });
  assert.deepEqual(browserLocales(), { languages: ['ng-NG'], language: 'fr' });
  stubNavigator({ languages: 'not an array' });
  assert.deepEqual(browserLocales(), { languages: [], language: undefined });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, get() { throw new Error('navigator access denied'); } });
  assert.deepEqual(browserLocales(), { languages: [], language: undefined });
});

test('a fresh visitor with a Sierra Leone locale is initialised to the persisted NLE decision', () => {
  stubNavigator({ languages: ['sl-SL'], language: 'sl-SL' });
  assert.equal(initialCurrencyPreference(), 'NLE');
  assert.equal(localStorage.getItem(CURRENCY_STORAGE_KEY), 'NLE');
  assert.equal(readStoredCurrencyPreference(), 'NLE');
  assert.equal(readCurrencyPreference(), 'NLE');
});

test('a stored selection, including explicit NLE, overrides the browser locale', () => {
  stubNavigator({ languages: ['en-US'], language: 'en-US' });
  writeCurrencyPreference('GHS');
  assert.equal(initialCurrencyPreference(), 'GHS');
  assert.equal(localStorage.getItem(CURRENCY_STORAGE_KEY), 'GHS');
  writeCurrencyPreference('NLE');
  assert.equal(initialCurrencyPreference(), 'NLE');
  assert.equal(localStorage.getItem(CURRENCY_STORAGE_KEY), 'NLE');
});

test('an invalid stored preference is replaced by one region-based initial decision', () => {
  stubNavigator({ languages: ['gh-GH'], language: 'gh-GH' });
  localStorage.setItem(CURRENCY_STORAGE_KEY, 'fantasy-code');
  assert.equal(isSupportedCurrency('fantasy-code'), false);
  assert.equal(readStoredCurrencyPreference(), null);
  assert.equal(initialCurrencyPreference(), 'GHS');
  assert.equal(localStorage.getItem(CURRENCY_STORAGE_KEY), 'GHS');
});

test('storage unavailability still yields a safe in-memory selection with no crash', () => {
  stubNavigator({ languages: ['en-US'], language: 'en-US' });
  stubWithThrowingStorage();
  assert.equal(initialCurrencyPreference(), 'USD');
  // Nothing was persisted while storage was unavailable; the value stays in
  // memory for the session and NLE remains the commerce currency everywhere.
  stubNavigator({ languages: ['sl-SL'], language: 'sl-SL' });
  assert.equal(initialCurrencyPreference(), 'NLE');
});
