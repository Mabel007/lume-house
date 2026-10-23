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
export const RATES_URL =
  'https://api.frankfurter.dev/v2/rates?base=SLE&quotes=GNF,GHS,NGN,USD';

export interface RatesPayload {
  base: 'SLE';
  date: string;
  rates: Record<string, number>;
}

export function isValidRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function parseRatesPayload(raw: unknown): RatesPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.base !== 'SLE') return null;
  if (typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return null;
  if (!o.rates || typeof o.rates !== 'object' || Array.isArray(o.rates)) return null;
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.rates as Record<string, unknown>)) {
    if (!isValidRate(v)) return null;
    rates[k] = v;
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
  return Math.round(major * factor);
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
  if (currency === 'NLE') return null;
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
export function parseFrankfurterResponse(raw: unknown): RatesPayload | null {
  if (!Array.isArray(raw)) {
    // Possibly a single object.
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      if (typeof o.quote === 'string' && isValidRate(o.rate)) {
        const date = typeof o.date === 'string' ? o.date : '';
        const rates: Record<string, number> = { [o.quote]: o.rate as number };
        return parseRatesPayload({ base: 'SLE', date, rates });
      }
    }
    return null;
  }
  const rates: Record<string, number> = {};
  let date = '';
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const o = item as Record<string, unknown>;
    if (typeof o.quote !== 'string') return null;
    if (!isValidRate(o.rate)) return null;
    rates[o.quote] = o.rate as number;
    if (typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) date = o.date;
  }
  if (!date) return null;
  return parseRatesPayload({ base: 'SLE', date, rates });
}

interface CacheEntry {
  storedAt: number;
  payload: RatesPayload;
}

let inFlight: Promise<RatesPayload | null> | null = null;

export async function loadRates(fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<RatesPayload | null> {
  // Cache check.
  try {
    const cached = localStorage.getItem(RATES_STORAGE_KEY);
    if (cached) {
      const entry = JSON.parse(cached) as CacheEntry;
      if (entry && typeof entry.storedAt === 'number' && now - entry.storedAt < RATES_TTL_MS) {
        const payload = parseRatesPayload(entry.payload);
        if (payload) return payload;
      }
    }
  } catch {
    // ignore
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
        const entry: CacheEntry = { storedAt: now, payload };
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

export function clearRatesCache(): void {
  try {
    localStorage.removeItem(RATES_STORAGE_KEY);
  } catch {
    // ignore
  }
  inFlight = null;
}
