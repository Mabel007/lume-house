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
  date: string; // ISO calendar date, the Frankfurter reference (as-of) date
  rates: Record<string, number>;
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

export function parseRatesPayload(raw: unknown): RatesPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  // 1. Exact response base SLE.
  if (o.base !== 'SLE') return null;
  // 3. Real calendar dates.
  if (!isRealCalendarDate(o.date)) return null;
  // 2. Supported quote currency codes; 6. explicit completeness policy:
  //    every supported pair must be present and valid, otherwise reject.
  if (!o.rates || typeof o.rates !== 'object' || Array.isArray(o.rates)) return null;
  const rates: Record<string, number> = {};
  for (const code of SUPPORTED_ESTIMATE_CURRENCIES) {
    const value = (o.rates as Record<string, unknown>)[code];
    if (!isValidRate(value)) return null; // missing or invalid pair -> reject whole payload
    rates[code] = value;
  }
  return { base: 'SLE', date: o.date, rates };
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
  const converted = convertMinorUnits(minorUnits, rate, decimals);
  return formatEstimateAmount(converted, currency, decimals);
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

export function writeCurrencyPreference(currency: SelectedCurrency): void {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {
    // ignore
  }
}

// Parse the Frankfurter v2 array response into a RatesPayload.
// Array items carry quote/rate/date but no base; SLE is asserted by the caller.
export function parseFrankfurterResponse(raw: unknown): RatesPayload | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return null;
  const rates: Record<string, number> = {};
  let date = '';
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const o = item as Record<string, unknown>;
    if (typeof o.quote !== 'string') return null;
    if (!SUPPORTED_ESTIMATE_CURRENCIES.includes(o.quote as EstimateCurrency)) return null;
    if (!isValidRate(o.rate)) return null;
    if (!isRealCalendarDate(o.date)) return null;
    if (date && date !== o.date) return null;
    date = o.date;
    rates[o.quote] = o.rate as number;
  }
  if (!date) return null;
  return parseRatesPayload({ base: 'SLE', date, rates });
}

let inFlight: Promise<RatesPayload | null> | null = null;

export async function loadRates(fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<RatesPayload | null> {
  // Cache check: finite, nonfuture storedAt, valid payload, within TTL, fresh reference date.
  try {
    const cached = localStorage.getItem(RATES_STORAGE_KEY);
    if (cached) {
      const entry = JSON.parse(cached) as RatesCacheEntry;
      if (
        entry &&
        typeof entry.storedAt === 'number' &&
        Number.isFinite(entry.storedAt) &&
        entry.storedAt <= now &&
        now - entry.storedAt < RATES_TTL_MS
      ) {
        const payload = parseRatesPayload(entry.payload);
        if (payload && !isStale(payload, entry.storedAt, now)) return payload;
      }
    }
  } catch {
    // ignore corrupt cache
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetchImpl(RATES_URL);
      if (!res.ok) return null;
      const json = await res.json();
      const payload = parseFrankfurterResponse(json);
      if (!payload) return null;
      try {
        const entry: RatesCacheEntry = { storedAt: now, payload };
        localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(entry));
      } catch {
        // ignore
      }
      return payload;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

// Freshness policy: an indefinitely open tab must not show an expired estimate
// as current. Stale when cache is missing/expired or the reference date is too
// old or in the future. Cache-write time (storedAt) is never the rate date.
export function isStale(payload: RatesPayload, fetchedAt: number | null, now: number): boolean {
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
