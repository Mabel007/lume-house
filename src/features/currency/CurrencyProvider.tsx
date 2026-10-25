import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CurrencyContext } from './CurrencyContext';
import {
  estimateFor,
  isStale,
  loadRatesEntry,
  rateExpiresAt,
  writeCurrencyPreference,
  type RatesCacheEntry,
} from './currency';
import { initialCurrencyPreference } from './localeCurrency';
import type { SelectedCurrency } from './currency';

const REVALIDATE_MS = 15 * 60 * 1000;

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setSelection] = useState<SelectedCurrency>(initialCurrencyPreference);
  const [result, setResult] = useState<{ entry: RatesCacheEntry | null } | null>(null);
  const [now, setNow] = useState(Date.now);
  const nextAttempt = useRef(0);
  const request = useRef<Promise<RatesCacheEntry | null> | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const enabled = currency !== 'NLE';
  useEffect(() => {
    if (!enabled) return;
    let pending = false;
    let current: RatesCacheEntry | null = null;
    const refresh = async () => {
      const now = Date.now();
      if (pending || (current && !isStale(current.payload, current.storedAt, now))) return;
      if (!request.current) {
        if (now < nextAttempt.current) return;
        nextAttempt.current = now + REVALIDATE_MS;
        request.current = loadRatesEntry().finally(() => { request.current = null; });
      }
      pending = true;
      const entry = await request.current;
      pending = false;
      if (!mounted.current) return;
      current = entry;
      setResult({ entry });
      setNow(Date.now());
    };
    // Responses never resubscribe this effect or initiate another request.
    void refresh();
    const interval = setInterval(() => { void refresh(); }, REVALIDATE_MS);
    const onFocus = () => { setNow(Date.now()); void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [enabled]);
  const entry = result?.entry;
  useEffect(() => {
    if (!entry || !enabled) return;
    // Cache hits retain storedAt; expire at the earlier reference-age/TTL limit.
    const delay = rateExpiresAt(entry) - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [entry, enabled]);
  const setCurrency = useCallback((next: SelectedCurrency) => {
    writeCurrencyPreference(next);
    setSelection(next);
    setNow(Date.now());
  }, []);
  const payload = enabled && entry && !isStale(entry.payload, entry.storedAt, now) ? entry.payload : null;
  const estimate = (minorUnits: number) => {
    if (!entry || isStale(entry.payload, entry.storedAt, now)) return null;
    return estimateFor(minorUnits, currency, payload);
  };
  return <CurrencyContext.Provider value={{ currency, setCurrency, estimate, payload, loading: enabled && result === null, failed: enabled && result !== null && !payload }}>{children}</CurrencyContext.Provider>;
}
