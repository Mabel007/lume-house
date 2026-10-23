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
        aria-describedby={currency === 'NLE' ? undefined : 'currency-disclosure'}
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
// One explanation per customer layout, not one per product/price.
export function CurrencyDisclosure() {
  const { currency, payload, loading } = useCurrencyEstimate();
  if (currency === 'NLE') return null;
  return <p id="currency-disclosure" className="wrap currency-disclosure" role="status">
    {payload ? <>Informational estimates from Frankfurter, reference rates as of <time dateTime={payload.date}>{payload.date}</time>.</> : loading ? 'Loading Frankfurter reference-rate estimates.' : 'Reference-rate estimates are unavailable.'}
    {' '}Checkout and payment amounts remain in NLE.
  </p>;
}
