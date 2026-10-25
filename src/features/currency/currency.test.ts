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
  rateExpiresAt,
  referenceDateGroups,
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

test('calendar, reference-age and future-date anchors are rejected; missing pair rows are rejected', () => {
  const now = Date.parse('2026-10-23T00:00:00Z');
  for (const date of ['2026-02-30', '2026-10-24', '2026-10-16', '2000-01-01']) {
    assert.equal(parseRatesPayload({...samplePayload, date}, now), null);
  }
  assert.ok(parseRatesPayload({...samplePayload, date:'2026-10-17'}, now));
  const rows = Object.entries(samplePayload.rates).map(([quote, rate]) => ({base:'SLE', quote, rate, date:'2026-10-23'}));
  assert.equal(parseFrankfurterResponse(rows.slice(1), now), null);
  assert.ok(parseFrankfurterResponse(rows, now), 'valid mixed pair dates are accepted (QA-FX-01)');
});

// QA-FX-01: Frankfurter mixes pair reference dates (for example GHS/GNF/NGN on
// one date and USD two days earlier). Valid mixed rows are accepted with each
// pair's own date preserved and the oldest as the conservative payload anchor.
const mixedRows = () => [
  { base:'SLE', quote:'GNF', rate:552.74, date:'2026-10-23' },
  { base:'SLE', quote:'GHS', rate:0.73113, date:'2026-10-23' },
  { base:'SLE', quote:'NGN', rate:83.54, date:'2026-10-23' },
  { base:'SLE', quote:'USD', rate:0.06266, date:'2026-10-21' },
];

test('mixed valid reference dates are preserved per pair with the oldest conservative anchor', () => {
  const parsed = parseFrankfurterResponse(mixedRows())!;
  assert.ok(parsed);
  assert.equal(parsed.date, '2026-10-21');
  // Full per-pair map: every pair lists its own date (USD's equals the anchor,
  // which also carries it as the payload-level date), and the map must
  // round-trip through the localStorage cache unchanged.
  assert.deepEqual(parsed.quoteDates, { GNF:'2026-10-23', GHS:'2026-10-23', NGN:'2026-10-23', USD:'2026-10-21' });
  assert.deepEqual(referenceDateGroups(parsed), [
    { date:'2026-10-21', currencies:['USD'] },
    { date:'2026-10-23', currencies:['GNF','GHS','NGN'] },
  ]);
});

test('uniform reference dates keep the exact legacy payload shape', () => {
  assert.deepEqual(parseRatesPayload(samplePayload), samplePayload);
  assert.deepEqual(parseFrankfurterResponse(mixedRows().map(row => ({ ...row, date:'2026-10-22' }))), samplePayload);
  // A map whose every entry repeats the shared date drops the key and yields
  // the exact legacy uniform shape.
  assert.deepEqual(parseRatesPayload({ ...samplePayload, quoteDates:{ GNF:'2026-10-22', GHS:'2026-10-22', NGN:'2026-10-22', USD:'2026-10-22' } }), samplePayload);
  assert.deepEqual(referenceDateGroups(samplePayload), [
    { date:'2026-10-22', currencies:['GNF','GHS','NGN','USD'] },
  ]);
});

test('malformed per-pair date maps and invalid pair dates reject the whole payload', () => {
  const full = { GNF:'2026-10-22', GHS:'2026-10-22', NGN:'2026-10-22', USD:'2026-10-21' };
  assert.equal(parseRatesPayload({ ...samplePayload, quoteDates:{ GNF:'2026-10-22', GHS:'2026-10-22', NGN:'2026-10-22' } }), null); // partial map
  assert.equal(parseRatesPayload({ ...samplePayload, quoteDates:{ ...full, EUR:'2026-10-22' } }), null); // unknown code
  assert.equal(parseRatesPayload({ ...samplePayload, quoteDates:[full] }), null); // array shape
  assert.equal(parseRatesPayload({ ...samplePayload, quoteDates:'2026-10-22' }), null); // scalar
  assert.equal(parseRatesPayload({ ...samplePayload, quoteDates:null }), null);
  assert.equal(parseRatesPayload({ ...samplePayload, quoteDates:{ ...full, USD:'10-21-2026' } }), null); // wrong date shape
  for (const usdDate of ['2026-02-30', '2026-10-24', '2026-10-16']) { // bad calendar / future / expired pair
    assert.equal(parseRatesPayload({ ...samplePayload, quoteDates:{ ...full, USD:usdDate } }), null);
    assert.equal(parseFrankfurterResponse(mixedRows().map(row => row.quote === 'USD' ? { ...row, date:usdDate } : row)), null);
  }
  // The anchor and the map must agree in either direction: an anchor that is
  // not the smallest mapped pair date is malformed input, not merely unusual.
  assert.equal(parseRatesPayload({ ...samplePayload, quoteDates:{ GNF:'2026-10-23', GHS:'2026-10-23', NGN:'2026-10-23', USD:'2026-10-21' } }), null); // map's oldest predates the anchor
  assert.equal(parseRatesPayload({ ...samplePayload, date:'2026-10-21', quoteDates:{ GNF:'2026-10-22', GHS:'2026-10-22', NGN:'2026-10-22', USD:'2026-10-22' } }), null); // anchor predates every mapped pair
});

test('aggregate staleness stays conservative: the oldest pair date decides the shared horizon', () => {
  const parsed = parseFrankfurterResponse(mixedRows())!;
  assert.ok(parsed);
  // A cache written near the end of the mixed payload's reference window; the
  // fetchedAt TTL window stays satisfied throughout, so only the reference
  // age differs between the two payloads below.
  const storedAt = Date.parse('2026-10-27T12:00:00Z');
  const oldestHorizon = Date.parse('2026-10-28T00:00:00Z'); // 2026-10-21 + 7d
  assert.equal(isStale(parsed, storedAt, storedAt), false);
  assert.equal(isStale(parsed, storedAt, oldestHorizon - 1), false, 'still current at the last instant of the oldest pair window');
  // The oldest pair (USD, 2026-10-21) expires although GNF/GHS/NGN
  // (2026-10-23) would still be current for two more days on their own.
  assert.equal(isStale(parsed, storedAt, oldestHorizon), true);
  assert.equal(isStale({...samplePayload, date:'2026-10-23'}, storedAt, oldestHorizon), false, 'fresher pairs alone would remain current: the oldest anchor decides');
  const lateStoredAt = Date.parse('2026-10-27T13:00:00Z');
  assert.equal(isStale(parsed, lateStoredAt, lateStoredAt), false);
  assert.equal(rateExpiresAt({ storedAt: lateStoredAt, payload: parsed }), oldestHorizon,
    'rateExpiresAt is anchored to the oldest pair date, not the freshest');
});

// QA-FX-01 R2 (Codex Finding 1): Frankfurter's exact mismatch fixture —
// USD on 2026-10-23 and GHS/GNF/NGN on 2026-10-25, cached with the aggregate
// date 2026-10-25 — accepted a newer-than-oldest anchor, so the shared
// staleness checks (driven by the anchor) kept a seven-day-old USD pair
// visible while 2026-10-30T00:00:00Z had already expired it. The corrected
// parser rejects that inconsistent cached payload outright; parsing the rows
// afresh always derives the true conservative anchor itself.
const codexRows = () => [
  { base:'SLE', quote:'USD', rate:0.06266, date:'2026-10-23' },
  { base:'SLE', quote:'GNF', rate:552.74, date:'2026-10-25' },
  { base:'SLE', quote:'GHS', rate:0.73113, date:'2026-10-25' },
  { base:'SLE', quote:'NGN', rate:83.54, date:'2026-10-25' },
];
const codexMismatchPayload = () => ({
  base: 'SLE' as const,
  date: '2026-10-25',
  rates: samplePayload.rates,
  quoteDates: { GNF:'2026-10-25', GHS:'2026-10-25', NGN:'2026-10-25', USD:'2026-10-23' },
});

test('a cached aggregate anchor newer than the oldest pair date is rejected; parsed rows derive the true anchor', () => {
  const now = Date.parse('2026-10-28T12:00:00Z'); // every reported date is individually current at this now
  assert.equal(parseRatesPayload(codexMismatchPayload(), now), null,
    'the cached aggregate 2026-10-25 is not the oldest pair date (USD 2026-10-23) and is rejected');
  assert.equal(parseRatesPayload({ ...codexMismatchPayload(), date:'2026-10-21', quoteDates:{ GNF:'2026-10-25', GHS:'2026-10-25', NGN:'2026-10-25', USD:'2026-10-25' } }), null,
    'an anchor older than every mapped pair is equally inconsistent');
  const fresh = parseFrankfurterResponse(codexRows(), now)!;
  assert.ok(fresh);
  assert.equal(fresh.date, '2026-10-23', 'fresh rows derive the true conservative anchor, never the freshest date');
  assert.deepEqual(fresh.quoteDates, { GNF:'2026-10-25', GHS:'2026-10-25', NGN:'2026-10-25', USD:'2026-10-23' });
});

test('the oldest pair date ends even a consistent cached payload at the exact 2026-10-30T00:00:00Z boundary', () => {
  const consistent = parseFrankfurterResponse(codexRows(), Date.parse('2026-10-28T12:00:00Z'))!;
  assert.ok(consistent);
  const storedAt = Date.parse('2026-10-29T12:00:00Z'); // well inside the 24h cache TTL for every stake below
  const usdHorizon = Date.parse('2026-10-30T00:00:00Z'); // exactly 2026-10-23 + 7 days for the USD pair
  assert.equal(rateExpiresAt({ storedAt, payload: consistent }), usdHorizon,
    'whole-payload expiry follows the oldest pair date, never the fresher 2026-10-25 pairs');
  assert.equal(isStale(consistent, storedAt, usdHorizon - 1), false, 'current through the last instant before the oldest pair expires');
  assert.equal(isStale(consistent, storedAt, usdHorizon), true, 'at the exact UTC boundary the seven-day-old USD pair expires the shared horizon');
});

test('localStorage recovery never uses an inconsistent cached aggregate and refetches deterministically', async () => {
  clearRatesCache();
  const now = Date.parse('2026-10-28T12:00:00Z');
  localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({ storedAt: now, payload: codexMismatchPayload() }));
  let refetches = 0;
  const recovered = await loadRatesEntry(async () => { refetches++; return new Response(JSON.stringify(codexRows())); }, () => now);
  assert.equal(refetches, 1, 'cached recovery validates the blob instead of trusting it, and refetches on rejection');
  assert.ok(recovered);
  assert.equal(recovered!.payload.date, '2026-10-23', 'recovery derives the true conservative anchor');
  assert.deepEqual(recovered!.payload.quoteDates, { GNF:'2026-10-25', GHS:'2026-10-25', NGN:'2026-10-25', USD:'2026-10-23' });
  assert.deepEqual(JSON.parse(localStorage.getItem(RATES_STORAGE_KEY)!).payload, recovered!.payload,
    'the recovered consistent payload replaces the inconsistent blob in the cache');
  clearRatesCache();
});

test('mixed payloads cache with their per-pair dates; older payloads without the map still hit', async () => {
  clearRatesCache();
  const first = await loadRates(async () => new Response(JSON.stringify(mixedRows())));
  assert.ok(first);
  assert.deepEqual(first!.quoteDates, { GNF:'2026-10-23', GHS:'2026-10-23', NGN:'2026-10-23', USD:'2026-10-21' });
  let calls = 0;
  const hit = await loadRatesEntry(async () => { calls++; throw new Error('must use only the cache'); });
  assert.equal(calls, 0);
  assert.deepEqual(hit?.payload, first);
  clearRatesCache();
  // Pre-QA-FX-01 cache entries carry no per-pair map and remain valid hits.
  localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({ storedAt: Date.now(), payload: samplePayload }));
  const legacy = await loadRatesEntry(async () => { calls++; throw new Error('must use only the cache'); });
  assert.equal(calls, 0);
  assert.deepEqual(legacy?.payload, samplePayload);
  clearRatesCache();
  // An expired pair date makes the whole cached payload unusable and refetches.
  localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({
    storedAt: Date.now(),
    payload: { base:'SLE', date:'2026-10-16', rates:samplePayload.rates, quoteDates:{ GNF:'2026-10-23', GHS:'2026-10-23', NGN:'2026-10-23', USD:'2026-10-16' } },
  }));
  let refetches = 0;
  const refreshed = await loadRates(async () => { refetches++; return new Response(JSON.stringify(mixedRows())); });
  assert.equal(refetches, 1);
  assert.ok(refreshed);
  assert.equal(refreshed!.date, '2026-10-21');
  clearRatesCache();
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
