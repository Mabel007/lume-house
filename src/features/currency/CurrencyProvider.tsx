import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  loadRates,
  readCurrencyPreference,
  writeCurrencyPreference,
  estimateFor,
  isStale,
  type RatesPayload,
  type SelectedCurrency,
  PRIMARY_CURRENCY,
} from './currency';

export interface CurrencyContextValue {
  currency: SelectedCurrency;
  setCurrency: (next: SelectedCurrency) => void;
  estimate: (minorUnits: number) => string | null;
  payload: RatesPayload | null;
  loading: boolean;
  failed: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

// Revalidation interval for an indefinitely open tab: a rate shown hours after
// it was fetched must not be presented as current without a freshness check.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<SelectedCurrency>(() => readCurrencyPreference());
  const [payload, setPayload] = useState<RatesPayload | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback((): Promise<void> => {
    const now = Date.now();
    if (payload && !isStale(payload, fetchedAt, now)) return Promise.resolve();
    setLoading(true);
    setFailed(false);
    return loadRates().then((p) => {
      setLoading(false);
      if (p) {
        setPayload(p);
        setFetchedAt(Date.now());
        setFailed(false);
      } else {
        setPayload(null);
        setFetchedAt(null);
        setFailed(true);
      }
    });
  }, [payload, fetchedAt]);

  // Load on mount (preference may be non-NLE) and revalidate when stale so an
  // indefinitely open tab never presents an expired estimate as current.
  useEffect(() => {
    if (currency === PRIMARY_CURRENCY) {
      setPayload(null);
      setFetchedAt(null);
      setFailed(false);
      setLoading(false);
      return;
    }
    void refresh();
  }, [currency, refresh]);

  // Periodic freshness revalidation while a non-primary currency is selected.
  useEffect(() => {
    if (currency === PRIMARY_CURRENCY) return undefined;
    const id = setInterval(() => {
      const now = Date.now();
      if (payload && isStale(payload, fetchedAt, now) && !loading) void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [currency, payload, fetchedAt, loading, refresh]);

  const setCurrency = useCallback((next: SelectedCurrency) => {
    writeCurrencyPreference(next);
    setCurrencyState(next);
    if (next === PRIMARY_CURRENCY) {
      setPayload(null);
      setFetchedAt(null);
      setFailed(false);
      setLoading(false);
    }
  }, []);

  const estimate = useCallback((minorUnits: number) => estimateFor(minorUnits, currency, payload), [currency, payload]);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, estimate, payload, loading, failed }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider');
  return ctx;
}
