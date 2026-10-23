import assert from 'node:assert/strict';
import { test, before, after, mock } from 'node:test';
before(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-23T12:00:00Z') }));
after(() => mock.timers.reset());

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
  loadRatesEntry,
  isStale,
  RATES_TIMEOUT_MS,
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


test('every response row requires SLE, including mixed bases and missing base', () => {
  const rows = Object.entries(samplePayload.rates).map(([quote, rate]) => ({base:'SLE', quote, rate, date:samplePayload.date}));
  for (const base of ['USD', undefined, 'sle']) {
    assert.equal(parseFrankfurterResponse(rows.map((row, i) => i === 2 ? {...row, base} : row)), null);
  }
  assert.equal(parseFrankfurterResponse([...rows, rows[0]]), null);
});

test('calendar, reference-age boundary, future date, mixed date and missing pair are rejected', () => {
  const now = Date.parse('2026-10-23T00:00:00Z');
  for (const date of ['2026-02-30', '2026-10-24', '2026-10-16', '2000-01-01']) {
    assert.equal(parseRatesPayload({...samplePayload, date}, now), null);
  }
  assert.ok(parseRatesPayload({...samplePayload, date:'2026-10-17'}, now));
  const rows = Object.entries(samplePayload.rates).map(([quote, rate]) => ({base:'SLE', quote, rate, date:samplePayload.date}));
  assert.equal(parseFrankfurterResponse(rows.slice(1), now), null);
  assert.equal(parseFrankfurterResponse(rows.map((r, i) => i ? r : {...r, date:'2026-10-21'}), now), null);
});

test('freshly fetched stale, future and wrong-base responses are neither returned nor cached', async () => {
  for (const patch of [{date:'2000-01-01'}, {date:'2026-10-24'}, {base:'USD'}]) {
    clearRatesCache();
    const rows = Object.entries(samplePayload.rates).map(([quote, rate]) => ({base:'SLE', quote, rate, date:samplePayload.date, ...patch}));
    assert.equal(await loadRates(async () => new Response(JSON.stringify(rows))), null);
    assert.equal(localStorage.getItem(RATES_STORAGE_KEY), null);
  }
});

test('cache hits retain original storedAt; future/corrupt/expired entries fall back safely', async () => {
  const now = Date.now(), storedAt = now - RATES_TTL_MS + 1000;
  localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({storedAt, payload:samplePayload}));
  const hit = await loadRatesEntry(async () => { throw Error('must use cache'); });
  assert.equal(hit?.storedAt, storedAt);
  assert.equal(isStale(samplePayload, storedAt, now + 1000), true);
  for (const stamp of [now + 1, now - RATES_TTL_MS, -Infinity]) {
    localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({storedAt:stamp, payload:samplePayload}));
    let calls = 0;
    assert.equal(await loadRates(async () => { calls++; throw Error('offline'); }), null);
    assert.equal(calls, 1);
  }
  clearRatesCache();
});

test('unsafe conversion output is omitted rather than throwing into a customer render', () => {
  const huge = {...samplePayload, rates:{...samplePayload.rates, USD:Number.MAX_VALUE}};
  for (const input of [Number.MAX_SAFE_INTEGER, NaN, Infinity, -1, 1.2]) {
    assert.equal(estimateFor(input, 'USD', huge), null);
  }
});

test('simultaneous callers share one request', async () => {
  clearRatesCache();
  let calls = 0;
  const rows = Object.entries(samplePayload.rates).map(([quote, rate]) => ({base:'SLE', quote, rate, date:samplePayload.date}));
  const fetcher = async () => { calls++; return new Response(JSON.stringify(rows)); };
  const values = await Promise.all([loadRates(fetcher), loadRates(fetcher), loadRates(fetcher)]);
  assert.equal(calls, 1);
  assert.ok(values.every(Boolean));
  clearRatesCache();
});

test('a hanging fetch times out and releases inFlight without blocking subsequent requests', async t => {
  clearRatesCache();
  t.mock.timers.enable({apis:['setTimeout']});
  const request: { signal?: AbortSignal | null } = {};
  const pending = loadRates(async (_url, options) => { request.signal = options?.signal; return new Promise(() => {}); });
  t.mock.timers.tick(RATES_TIMEOUT_MS);
  assert.equal(await pending, null);
  assert.equal(request.signal?.aborted, true);
  assert.equal(await loadRates(async () => new Response('', {status:503})), null);
});
