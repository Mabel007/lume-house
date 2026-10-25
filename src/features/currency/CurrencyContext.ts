import { createContext, useContext } from 'react';
import type { RatesPayload, SelectedCurrency } from './currency';

export interface CurrencyContextValue {
  currency: SelectedCurrency;
  setCurrency: (next: SelectedCurrency) => void;
  estimate: (minorUnits: number) => string | null;
  payload: RatesPayload | null;
  loading: boolean;
  failed: boolean;
}

export const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within a CurrencyProvider');
  return context;
}

// Null-safe reader for shared presentational components (such as OrderSummary)
// that legitimately mount without a CurrencyProvider (order history surfaces,
// provider-free test harnesses). Unknown context behaves like NLE so these
// displays stay authoritative and quiet; interactive consumers above keep the
// strict throw.
export function useOptionalCurrency(): CurrencyContextValue | null {
  return useContext(CurrencyContext);
}
