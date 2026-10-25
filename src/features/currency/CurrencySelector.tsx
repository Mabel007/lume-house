import type { ReactNode } from 'react';
import { useCurrencyEstimate } from './useCurrency';
import { referenceDateGroups, type SelectedCurrency } from './currency';

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
// provider, the pair reference dates (listed per pair when they differ,
// QA-FX-01) and the payment-provider quote limitation collapse into a
// keyboard-accessible <details> so the storefront does not repeat technical
// notices. No persistent live announcement: totals surfaces announce their own
// guidance once.
export function CurrencyDisclosure() {
  const { currency, payload, loading } = useCurrencyEstimate();
  if (currency === 'NLE') return null;
  let referenceLine: ReactNode;
  if (!payload) {
    referenceLine = loading
      ? 'Loading Frankfurter reference-rate estimates.'
      : 'Reference-rate estimates are unavailable.';
  } else {
    // A shared-date sentence only when every pair truly shares one date;
    // otherwise list each distinct pair date truthfully, oldest first.
    const groups = referenceDateGroups(payload);
    if (groups.length === 1) {
      referenceLine = <>Informational estimates from Frankfurter, reference rates as of <time dateTime={payload.date}>{payload.date}</time>.</>;
    } else {
      referenceLine = (
        <>
          Informational estimates from Frankfurter, reference rates:{' '}
          {groups.map((group, index) => (
            <span key={group.date} className="currency-reference-group">
              {index > 0 && (index === groups.length - 1 ? ' and ' : ', ')}
              {group.currencies.join(', ')} as of{' '}
              <time dateTime={group.date}>{group.date}</time>
            </span>
          ))}
          .
        </>
      );
    }
  }
  return <div id="currency-disclosure" className="currency-disclosure">
    <p className="currency-disclosure-primary">Foreign amounts are estimates. Checkout and payment amounts remain in NLE.</p>
    <details>
      <summary>Reference-rate details</summary>
      <p>{referenceLine} An exchange-rate estimate is not a payment-provider quote.</p>
    </details>
  </div>;
}
