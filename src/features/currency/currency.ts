// Display-only currency estimation for international visitors.
// Authoritative amounts remain in NLE (internal SLE minor units).
// Estimates are derived from validated Frankfurter v2 reference rates and are
// never written to orders, checkout totals or payment flows.

export const PRIMARY_CURRENCY = 'NLE';
export const INTERNAL_CURRENCY = 'SLE';
export const SUPPORTED_ESTIMATE_CURRENCIES = ['GNF', 'GHS', 'NGN', 'USD'] as const;
export type EstimateCurrency = (typeof SUPPORTED_ESTIMATE_CURRENCIES)[number];
export type SelectedCurrency = 'NLE' | EstimateCurrency;

export const CURRENCY_STORAGE_KEY = 'lume:currency';
export const RATES_STORAGE_KEY = 'lume:fx:SLE';
export const RATES_TTL_MS = 24 * 60 * 60 * 1000;
// Reference rates older than seven days are treated as stale and revalidated.
export const MAX_REFERENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const RATES_URL =
  'https://api.frankfurter.dev/v2/rates?base=SLE&quotes=GNF,GHS,NGN,USD';

export interface RatesPayload {
  base: 'SLE';
  // The Frankfurter reference (as-of) date. For a mixed-date response
  // (QA-FX-01) this is the oldest pair date: the conservative anchor for
  // shared staleness checks, never presented as every pair's date.
  date: string;
  rates: Record<string, number>;
  // Every supported pair's actual reference date, present only when the
  // provider reported differing dates; absent entries share the payload-level
  // date, and older cached payloads without the whole map remain valid. The
  // map must round-trip through the localStorage cache unchanged.
  quoteDates?: Record<string, string>;
}

export interface RatesCacheEntry {
  storedAt: number; // cache-write time (never presented as the rate date)
  payload: RatesPayload;
}

export function isValidRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// A real calendar date: ISO shape plus an unambiguous, in-range date.
function isRealCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, year, month, day] = m.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(date.getTime())) return false;
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// The unchanged seven-day maximum age and future-date rejection, applied to
// every reference date exactly once. Used for the payload-level anchor and
// for each pair's own date.
function isCurrentReferenceDate(value: unknown, now: number): value is string {
  if (!isRealCalendarDate(value)) return false;
  if (!Number.isFinite(now)) return false;
  const reference = Date.parse(value);
  if (reference > now) return false; // future reference date
  if (now - reference >= MAX_REFERENCE_AGE_MS) return false;
  return true;
}

// Supported pairs may carry their own reference dates (mixed valid dates are
// accepted); the whole-payload all-required-rates policy is unchanged, so an
// invalid, expired or future date on ANY pair rejects the payload entirely.
// A partial per-pair date map or unknown extra entries are malformed input.
export function parseRatesPayload(raw: unknown, now = Date.now()): RatesPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  // 1. Exact response base SLE.
  if (o.base !== 'SLE') return null;
  // 3. Real calendar dates, never future, within the reference-age window.
  if (!isCurrentReferenceDate(o.date, now)) return null;
  // 2. Supported quote currency codes; 6. explicit completeness policy:
  //    every supported pair must be present and valid, otherwise reject.
  if (!o.rates || typeof o.rates !== 'object' || Array.isArray(o.rates)) return null;
  const rates: Record<string, number> = {};
  let quoteDates: Record<string, string> | undefined;
  // A present per-pair map must be a proper object: null, scalars, arrays,
  // partial maps and unknown codes are malformed input and reject the payload.
  if (o.quoteDates !== undefined && (o.quoteDates === null || typeof o.quoteDates !== 'object' || Array.isArray(o.quoteDates))) return null;
  const pairDates = o.quoteDates as Record<string, unknown> | undefined;
  for (const code of SUPPORTED_ESTIMATE_CURRENCIES) {
    const value = (o.rates as Record<string, unknown>)[code];
    if (!isValidRate(value)) return null; // missing or invalid pair -> reject whole payload
    rates[code] = value;
    // QA-FX-01: the actual date associated with this pair, falling back to the
    // shared payload date for older cached payloads without per-pair dates.
    const pairDate = pairDates === undefined ? o.date : (pairDates as Record<string, unknown>)[code];
    if (pairDate === undefined) return null; // partial per-pair map is malformed
    if (!isCurrentReferenceDate(pairDate, now)) return null;
    if (pairDates !== undefined) {
      // Full per-pair map: without minimization a mixed payload round-trips
      // through the localStorage cache with every pair's date intact.
      quoteDates = quoteDates ?? {};
      quoteDates[code] = pairDate as string;
    }
  }
  if (pairDates !== undefined) {
    for (const key of Object.keys(pairDates as Record<string, unknown>)) {
      if (!(SUPPORTED_ESTIMATE_CURRENCIES as readonly string[]).includes(key)) return null;
    }
    // QA-FX-01 R2 (Codex Finding 1): the payload-level anchor must equal the
    // oldest validated per-pair date — the value every shared staleness check
    // (isStale / rateExpiresAt) reads. A cached aggregate claiming a newer
    // anchor would keep stale pairs visible after the oldest pair had expired,
    // so an inconsistent cached payload is rejected outright (the cache read
    // path recovers by refetching); an anchor older than every mapped pair is
    // inconsistent in the same way and is rejected too.
    let oldestPairDate: string | null = null;
    for (const code of SUPPORTED_ESTIMATE_CURRENCIES) {
      const mapped = (pairDates as Record<string, unknown>)[code] as string;
      if (oldestPairDate === null || mapped < oldestPairDate) oldestPairDate = mapped;
    }
    if (oldestPairDate !== o.date) return null;
  }
  // A map whose every entry repeats the anchor is a uniform payload: drop the
  // key so the stored and returned shape match the legacy uniform shape.
  if (quoteDates && Object.keys(quoteDates).every(code => quoteDates![code] === o.date)) quoteDates = undefined;
  return { base: 'SLE', date: o.date, rates, ...(quoteDates ? { quoteDates } : {}) };
}

export function decimalsFor(code: string): number {
  // GNF is a whole-unit currency in common practice.
  return code === 'GNF' ? 0 : 2;
}

export function convertMinorUnits(minorUnits: number, rate: number, decimals: number): number {
  if (!Number.isSafeInteger(minorUnits)) throw new Error('Money must use integer minor units');
  if (!isValidRate(rate)) throw new Error('Invalid exchange rate');
  const major = (minorUnits / 100) * rate;
  const factor = Math.pow(10, decimals);
  const converted = Math.round(major * factor);
  if (!Number.isFinite(converted) || converted < 0 || converted > Number.MAX_SAFE_INTEGER) {
    throw new Error('Conversion result out of bounds');
  }
  return converted;
}

export function formatEstimateAmount(minorConverted: number, code: string, decimals: number): string {
  const major = minorConverted / Math.pow(10, decimals);
  return `${code} ${new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(major)}`;
}

export function estimateFor(
  minorUnits: number,
  currency: SelectedCurrency,
  payload: RatesPayload | null,
): string | null {
  if (currency === PRIMARY_CURRENCY) return null;
  if (!payload) return null;
  const rate = payload.rates[currency];
  if (!isValidRate(rate)) return null;
  const decimals = decimalsFor(currency);
  try {
    const converted = convertMinorUnits(minorUnits, rate, decimals);
    return formatEstimateAmount(converted, currency, decimals);
  } catch {
    return null;
  }
}

export function isSupportedCurrency(value: unknown): value is SelectedCurrency {
  return value === 'NLE' || (SUPPORTED_ESTIMATE_CURRENCIES as readonly string[]).includes(String(value));
}

export function readCurrencyPreference(): SelectedCurrency {
  try {
    const value = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (isSupportedCurrency(value)) return value;
  } catch {
    // ignore
  }
  return 'NLE';
}

// Distinction needed by first-visit locale detection: null means no usable
// stored value (absent, storage unavailable or an unsupported code), whereas
// readCurrencyPreference() defaults to NLE for existing call sites.
export function readStoredCurrencyPreference(): SelectedCurrency | null {
  try {
    const value = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (isSupportedCurrency(value)) return value;
  } catch {
    // Storage unavailable or unusable value — treat as no stored preference.
  }
  return null;
}

export function writeCurrencyPreference(currency: SelectedCurrency): void {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {
    // ignore
  }
}

// Parse the Frankfurter v2 array response into a RatesPayload.
// Every row must identify the requested base; never relabel another base.
// Rows may report different reference dates (QA-FX-01): valid differing dates
// are preserved per pair with the oldest becoming the payload-level anchor.
export function parseFrankfurterResponse(raw: unknown, now = Date.now()): RatesPayload | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return null;
  const rates: Record<string, number> = {};
  const pairDates: Record<string, string> = {};
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const o = item as Record<string, unknown>;
    if (o.base !== INTERNAL_CURRENCY) return null;
    if (typeof o.quote !== 'string') return null;
    if (!SUPPORTED_ESTIMATE_CURRENCIES.includes(o.quote as EstimateCurrency)) return null;
    const quote = o.quote as EstimateCurrency;
    if (Object.hasOwn(rates, quote)) return null;
    if (!isValidRate(o.rate)) return null;
    if (!isRealCalendarDate(o.date)) return null;
    pairDates[quote] = o.date;
    rates[quote] = o.rate as number;
  }
  const dates = SUPPORTED_ESTIMATE_CURRENCIES.map(code => pairDates[code]);
  if (dates.some(date => date === undefined)) return null; // a supported pair row is missing
  let oldest = dates[0] as string;
  for (const date of dates) if ((date as string) < oldest) oldest = date as string;
  const mixed = dates.some(date => date !== oldest);
  const payload: RatesPayload & { quoteDates?: Record<string, string> } = { base: 'SLE', date: oldest, rates };
  if (mixed) payload.quoteDates = Object.fromEntries(SUPPORTED_ESTIMATE_CURRENCIES.map(code => [code, pairDates[code] as string]));
  return parseRatesPayload(payload, now);
}

// Group the supported pairs by their actual reference date for truthful
// display: a uniform payload yields one group for all four codes, a mixed
// payload yields one group per distinct date in ascending date order.
export function referenceDateGroups(payload: RatesPayload): Array<{ date: string; currencies: EstimateCurrency[] }> {
  const groups: Array<{ date: string; currencies: EstimateCurrency[] }> = [];
  for (const code of SUPPORTED_ESTIMATE_CURRENCIES) {
    const date = payload.quoteDates?.[code] ?? payload.date;
    const group = groups.find(candidate => candidate.date === date);
    if (group) group.currencies.push(code);
    else groups.push({ date, currencies: [code] });
  }
  return groups.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

let inFlight: Promise<RatesCacheEntry | null> | null = null;
export const RATES_TIMEOUT_MS = 8000;

export async function loadRatesEntry(fetchImpl: typeof fetch = fetch, clock: () => number = Date.now): Promise<RatesCacheEntry | null> {
  const now = clock();
  try {
    const cached = localStorage.getItem(RATES_STORAGE_KEY);
    if (cached) {
      const entry = JSON.parse(cached) as RatesCacheEntry;
      if (entry && typeof entry.storedAt === 'number' && Number.isFinite(entry.storedAt) && entry.storedAt <= now && now - entry.storedAt < RATES_TTL_MS) {
        const payload = parseRatesPayload(entry.payload, now);
        if (payload && !isStale(payload, entry.storedAt, now)) return { storedAt: entry.storedAt, payload };
      }
    }
  } catch { /* unavailable storage or corrupt cache */ }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const json = await Promise.race([
        (async () => {
          const res = await fetchImpl(RATES_URL, { signal: controller.signal });
          if (!res.ok) throw new Error('Reference rates unavailable');
          return res.json() as Promise<unknown>;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Reference rate timeout')); }, RATES_TIMEOUT_MS);
        }),
      ]);
      const storedAt = clock();
      const payload = parseFrankfurterResponse(json, storedAt);
      if (!payload) return null;
      const entry: RatesCacheEntry = { storedAt, payload };
      try { localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(entry)); } catch { /* optional cache */ }
      return entry;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function loadRates(fetchImpl: typeof fetch = fetch, now?: number): Promise<RatesPayload | null> {
  return (await loadRatesEntry(fetchImpl, now === undefined ? Date.now : () => now))?.payload ?? null;
}

export function rateExpiresAt(entry: RatesCacheEntry): number {
  return Math.min(entry.storedAt + RATES_TTL_MS, Date.parse(entry.payload.date) + MAX_REFERENCE_AGE_MS);
}

// Freshness policy: an indefinitely open tab must not show an expired estimate
// as current. Stale when cache is missing/expired or the reference date is too
// old or in the future. Cache-write time (storedAt) is never the rate date.
export function isStale(payload: RatesPayload, fetchedAt: number | null, now: number): boolean {
  if (!Number.isFinite(now) || !isRealCalendarDate(payload.date)) return true;
  if (fetchedAt == null || !Number.isFinite(fetchedAt) || fetchedAt > now) return true;
  if (now - fetchedAt >= RATES_TTL_MS) return true;
  const reference = Date.parse(payload.date);
  if (!Number.isFinite(reference)) return true;
  if (reference > now) return true; // future reference date
  if (now - reference >= MAX_REFERENCE_AGE_MS) return true;
  return false;
}

export function clearRatesCache(): void {
  try {
    localStorage.removeItem(RATES_STORAGE_KEY);
  } catch {
    // ignore
  }
  inFlight = null;
}
