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
