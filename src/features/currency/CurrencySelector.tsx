import { useCurrencyEstimate } from './useCurrency';
import type { SelectedCurrency } from './currency';

export function CurrencySelector() {
  const { currency, setCurrency } = useCurrencyEstimate();
  return (
    <label className="currency-selector">
      <span className="sr-only">Display currency</span>
      <select
        value={currency}
        onChange={(event) => setCurrency(event.target.value as SelectedCurrency)}
        aria-label="Display currency"
      >
        <option value="NLE">NLE</option>
        <option value="GNF">GNF</option>
        <option value="GHS">GHS</option>
        <option value="NGN">NGN</option>
        <option value="USD">USD</option>
      </select>
    </label>
  );
}

export function CurrencyEstimate({ minorUnits }: { minorUnits: number }) {
  const { estimate } = useCurrencyEstimate();
  const text = estimate(minorUnits);
  if (!text) return null;
  return <span className="currency-estimate" aria-label="Estimated conversion">≈ {text}</span>;
}