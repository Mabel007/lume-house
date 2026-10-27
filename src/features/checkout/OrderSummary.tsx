import { CurrencyEstimate } from '../currency/CurrencySelector';
import { useOptionalCurrency } from '../currency/CurrencyContext';
import { formatMoney } from "../../config/shop";
export function OrderSummary({
  subtotal,
  deliveryFee = null,
  deliveryUnavailable = false,
  estimates = false,
}: {
  subtotal: number;
  deliveryFee?: number | null;
  deliveryUnavailable?: boolean;
  estimates?: boolean;
}) {
  // Shared totals guidance: one concise note per totals view for foreign
  // selections, never per price. Provider-less mounts (order history) stay
  // quiet — stored orders are NLE-authoritative by design.
  const currency = useOptionalCurrency()?.currency ?? 'NLE';
  return (
    <>
      <dl className="totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(subtotal)}{estimates && <CurrencyEstimate minorUnits={subtotal} />}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>
            {deliveryFee === null
              ? deliveryUnavailable
                ? "Unavailable"
                : "Choose at checkout"
              : formatMoney(deliveryFee)}
            {estimates && deliveryFee !== null && <CurrencyEstimate minorUnits={deliveryFee} />}
          </dd>
        </div>
        <div className="total">
          <dt>Total</dt>
          <dd>
            {deliveryFee === null
              ? deliveryUnavailable
                ? "Delivery unavailable"
                : "Delivery details needed"
              : formatMoney(subtotal + deliveryFee)}
            {estimates && deliveryFee !== null && <CurrencyEstimate minorUnits={subtotal + deliveryFee} />}
          </dd>
        </div>
      </dl>
      {estimates && currency !== 'NLE' && (
        <p className="estimate-note">Foreign amounts are estimates. Checkout and payment amounts remain in NLE. An exchange-rate estimate is not a payment-provider quote.</p>
      )}
    </>
  );
}
