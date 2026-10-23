import assert from 'node:assert/strict';
import { test } from 'node:test';

// Minimal localStorage polyfill for node test environment.
const store: Record<string, string> = {};
const localStoragePolyfill = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
(globalThis as unknown as { localStorage: Storage }).localStorage = localStoragePolyfill as unknown as Storage;

import {
  PRIMARY_CURRENCY,
  SUPPORTED_ESTIMATE_CURRENCIES,
  parseRatesPayload,
  parseFrankfurterResponse,
  isValidRate,
  convertMinorUnits,
  formatEstimateAmount,
  estimateFor,
  isSupportedCurrency,
  readCurrencyPreference,
  writeCurrencyPreference,
  loadRates,
  clearRatesCache,
  decimalsFor,
  type RatesPayload,
  CURRENCY_STORAGE_KEY,
  RATES_STORAGE_KEY,
  RATES_TTL_MS,
} from './currency.ts';

const samplePayload = {
  base: 'SLE' as const,
  date: '2026-10-22',
  rates: { GNF: 552.74, GHS: 0.73113, NGN: 83.54, USD: 0.06266 },
};

test('primary currency is uppercase NLE', () => {
  assert.equal(PRIMARY_CURRENCY, 'NLE');
});

test('supported estimate currencies are GNF, GHS, NGN, USD', () => {
  assert.deepEqual([...SUPPORTED_ESTIMATE_CURRENCIES], ['GNF', 'GHS', 'NGN', 'USD']);
});

test('parseRatesPayload accepts a valid payload', () => {
  assert.deepEqual(parseRatesPayload(samplePayload), samplePayload);
});

test('parseRatesPayload rejects invalid payloads', () => {
  assert.equal(parseRatesPayload(null), null);
  assert.equal(parseRatesPayload({ base: 'USD', date: '2026-10-22', rates: { GNF: 1 } }), null);
  assert.equal(parseRatesPayload({ base: 'SLE', date: 'bad', rates: { GNF: 1 } }), null);
  assert.equal(parseRatesPayload({ base: 'SLE', date: '2026-10-22', rates: { GNF: 0 } }), null);
  assert.equal(parseRatesPayload({ base: 'SLE', date: '2026-10-22', rates: { GNF: 'x' } }), null);
  assert.equal(parseRatesPayload({ base: 'SLE', date: '2026-10-22' }), null);
});

test('isValidRate validates positive finite numbers', () => {
  assert.equal(isValidRate(1), true);
  assert.equal(isValidRate(0), false);
  assert.equal(isValidRate(-1), false);
  assert.equal(isValidRate(NaN), false);
  assert.equal(isValidRate('1'), false);
});

test('parseFrankfurterResponse parses the array form', () => {
  const raw = [
    { date: '2026-10-22', base: 'SLE', quote: 'GNF', rate: 552.74 },
    { date: '2026-10-22', base: 'SLE', quote: 'GHS', rate: 0.73113 },
    { date: '2026-10-22', base: 'SLE', quote: 'NGN', rate: 83.54 },
    { date: '2026-10-22', base: 'SLE', quote: 'USD', rate: 0.06266 },
  ];
  const parsed = parseFrankfurterResponse(raw);
  assert.ok(parsed);
  assert.equal(parsed!.date, '2026-10-22');
  assert.equal(parsed!.rates.GNF, 552.74);
  assert.equal(parsed!.rates.USD, 0.06266);
});

test('parseFrankfurterResponse rejects malformed responses', () => {
  assert.equal(parseFrankfurterResponse([]), null);
  assert.equal(parseFrankfurterResponse([{ quote: 'GNF', rate: 0 }]), null);
  assert.equal(parseFrankfurterResponse('garbage'), null);
  assert.equal(parseFrankfurterResponse(null), null);
});

test('convertMinorUnits converts integer minor units', () => {
  // 100 minor units = 1 SLE; rate 0.06266 USD/SLE -> 0.06266 USD -> 6 minor USD units (0.06)
  assert.equal(convertMinorUnits(100, 0.06266, 2), 6);
});

test('formatEstimateAmount formats with fixed decimals', () => {
  assert.equal(formatEstimateAmount(6, 'USD', 2), 'USD 0.06');
  assert.equal(formatEstimateAmount(55274, 'GNF', 0), 'GNF 55,274');
});

test('estimateFor returns formatted estimate for supported currencies', () => {
  assert.equal(estimateFor(50000, 'USD', samplePayload), 'USD 31.33');
  assert.equal(estimateFor(50000, 'GNF', samplePayload), 'GNF 276,370');
  assert.equal(estimateFor(50000, 'GHS', samplePayload), 'GHS 365.57');
  assert.equal(estimateFor(50000, 'NGN', samplePayload), 'NGN 41,770.00');
});

test('estimateFor returns null for NLE or missing/invalid rates', () => {
  assert.equal(estimateFor(50000, 'NLE', samplePayload), null);
  assert.equal(estimateFor(50000, 'USD', null), null);
  const bad = { base: 'SLE' as const, date: '2026-10-22', rates: { USD: 0 } };
  assert.equal(estimateFor(50000, 'USD', bad as RatesPayload), null);
  const missing = { base: 'SLE' as const, date: '2026-10-22', rates: {} };
  assert.equal(estimateFor(50000, 'USD', missing), null);
});

test('isSupportedCurrency validates selection', () => {
  assert.equal(isSupportedCurrency('NLE'), true);
  assert.equal(isSupportedCurrency('USD'), true);
  assert.equal(isSupportedCurrency('EUR'), false);
  assert.equal(isSupportedCurrency(null), false);
});

test('currency preference persists and restores', () => {
  // jsdom localStorage available
  localStorage.removeItem(CURRENCY_STORAGE_KEY);
  assert.equal(readCurrencyPreference(), 'NLE');
  writeCurrencyPreference('USD');
  assert.equal(readCurrencyPreference(), 'USD');
  writeCurrencyPreference('NLE');
});

test('loadRates reuses fresh cache without fetching', async () => {
  clearRatesCache();
  const payload = samplePayload;
  localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({ storedAt: Date.now(), payload }));
  let fetchCalled = false;
  const fakeFetch = async () => { fetchCalled = true; return new Response('{}'); };
  const result = await loadRates(fakeFetch as unknown as typeof fetch);
  assert.equal(fetchCalled, false);
  assert.deepEqual(result, payload);
  clearRatesCache();
});

test('loadRates fetches and caches when cache is empty', async () => {
  clearRatesCache();
  const body = [
    { date: '2026-10-22', base: 'SLE', quote: 'GNF', rate: 552.74 },
    { date: '2026-10-22', base: 'SLE', quote: 'USD', rate: 0.06266 },
    { date: '2026-10-22', base: 'SLE', quote: 'GHS', rate: 0.73113 },
    { date: '2026-10-22', base: 'SLE', quote: 'NGN', rate: 83.54 },
  ];
  const fakeFetch = async () => new Response(JSON.stringify(body), { status: 200 });
  const result = await loadRates(fakeFetch as unknown as typeof fetch);
  assert.ok(result);
  assert.equal(result!.rates.GNF, 552.74);
  // cached
  const cached = localStorage.getItem(RATES_STORAGE_KEY);
  assert.ok(cached);
  clearRatesCache();
});

test('loadRates returns null on fetch failure and does not cache', async () => {
  clearRatesCache();
  const fakeFetch = async () => { throw new Error('network'); };
  const result = await loadRates(fakeFetch as unknown as typeof fetch);
  assert.equal(result, null);
  assert.equal(localStorage.getItem(RATES_STORAGE_KEY), null);
});

test('loadRates treats expired cache as unusable and refetches', async () => {
  clearRatesCache();
  const payload = samplePayload;
  localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({ storedAt: Date.now() - RATES_TTL_MS - 1000, payload }));
  const body = [
    { date: '2026-10-22', base: 'SLE', quote: 'GNF', rate: 552.74 },
    { date: '2026-10-22', base: 'SLE', quote: 'USD', rate: 0.06266 },
    { date: '2026-10-22', base: 'SLE', quote: 'GHS', rate: 0.73113 },
    { date: '2026-10-22', base: 'SLE', quote: 'NGN', rate: 83.54 },
  ];
  const fakeFetch = async () => new Response(JSON.stringify(body), { status: 200 });
  const result = await loadRates(fakeFetch as unknown as typeof fetch);
  assert.ok(result);
  clearRatesCache();
});

test('decimalsFor uses 0 for GNF and 2 otherwise', () => {
  assert.equal(decimalsFor('GNF'), 0);
  assert.equal(decimalsFor('USD'), 2);
  assert.equal(decimalsFor('GHS'), 2);
  assert.equal(decimalsFor('NGN'), 2);
});
