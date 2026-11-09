import { useCurrencyEstimate } from './useCurrency';

// Secondary, estimate-only amount: NLE stays the authoritative price.
// Automatic locale detection drives the display currency; no manual selection.
export function CurrencyEstimate({ minorUnits }: { minorUnits: number }) {
  const { estimate } = useCurrencyEstimate();
  const text = estimate(minorUnits);
  if (!text) return null;
  return <span className="currency-estimate" aria-label="Estimated conversion">≈ {text}</span>;
}
