import { useCurrencyEstimate } from './useCurrency';
import type { SelectedCurrency } from './currency';

// Footer-hosted manual display-currency control (B2.7 presentation).
// The primary navigation stays checkout-focused; this is the single visible
// selector, controlled only by CurrencyProvider, with a visible label so it
// is discoverable at every width and usable on touch and keyboard.
export function CurrencySelector() {
  const { currency, setCurrency } = useCurrencyEstimate();
  return (
    <label className="currency-selector">
      <span className="currency-label">Display currency</span>
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

// Secondary, estimate-only amount: NLE stays the authoritative price.
export function CurrencyEstimate({ minorUnits }: { minorUnits: number }) {
  const { estimate } = useCurrencyEstimate();
  const text = estimate(minorUnits);
  if (!text) return null;
  return <span className="currency-estimate" aria-label="Estimated conversion">≈ {text}</span>;
}
// One explanation per customer layout, not one per product/price. The concise
// visible line carries the two customer-facing limitations; reference
// provider, rate date and the payment-provider quote limitation collapse into
// a keyboard-accessible <details> so the storefront does not repeat technical
// notices. No persistent live announcement: totals surfaces announce their own
// guidance once.
export function CurrencyDisclosure() {
  const { currency, payload, loading } = useCurrencyEstimate();
  if (currency === 'NLE') return null;
  const referenceLine = payload
    ? <>Informational estimates from Frankfurter, reference rates as of <time dateTime={payload.date}>{payload.date}</time>.</>
    : loading ? 'Loading Frankfurter reference-rate estimates.' : 'Reference-rate estimates are unavailable.';
  return <div id="currency-disclosure" className="currency-disclosure">
    <p className="currency-disclosure-primary">Foreign amounts are estimates. Checkout and payment amounts remain in NLE.</p>
    <details>
      <summary>Reference-rate details</summary>
      <p>{referenceLine} An exchange-rate estimate is not a payment-provider quote.</p>
    </details>
  </div>;
}
