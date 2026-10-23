import { useEffect, useState } from 'react';
import {
  loadRates,
  readCurrencyPreference,
  writeCurrencyPreference,
  estimateFor,
  type RatesPayload,
  type SelectedCurrency,
} from './currency';

export function useCurrencyEstimate() {
  const [currency, setCurrencyState] = useState<SelectedCurrency>(() => readCurrencyPreference());
  const [payload, setPayload] = useState<RatesPayload | null>(null);

  useEffect(() => {
    if (currency === 'NLE') return;
    let active = true;
    loadRates().then((p) => {
      if (active) setPayload(p);
    });
    return () => {
      active = false;
    };
  }, [currency]);

  const setCurrency = (next: SelectedCurrency) => {
    writeCurrencyPreference(next);
    setCurrencyState(next);
    if (next === 'NLE') setPayload(null);
  };

  const estimate = (minorUnits: number) => estimateFor(minorUnits, currency, payload);

  return { currency, setCurrency, estimate, payload };
}