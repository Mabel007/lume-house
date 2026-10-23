import { CurrencyEstimate } from '../currency/CurrencySelector';
import { formatMoney } from "../../config/shop";
export function OrderSummary({
  subtotal,
  deliveryFee = null,
  estimates = false,
}: {
  subtotal: number;
  deliveryFee?: number | null;
  estimates?: boolean;
}) {
  return (
    <dl className="totals">
      <div>
        <dt>Subtotal</dt>
        <dd>{formatMoney(subtotal)}{estimates && <CurrencyEstimate minorUnits={subtotal} />}</dd>
      </div>
      <div>
        <dt>Delivery</dt>
        <dd>
          {deliveryFee === null
            ? "Choose at checkout"
            : formatMoney(deliveryFee)}
          {estimates && deliveryFee !== null && <CurrencyEstimate minorUnits={deliveryFee} />}
        </dd>
      </div>
      <div className="total">
        <dt>Total</dt>
        <dd>
          {deliveryFee === null
            ? "Delivery details needed"
            : formatMoney(subtotal + deliveryFee)}
          {estimates && deliveryFee !== null && <CurrencyEstimate minorUnits={subtotal + deliveryFee} />}
        </dd>
      </div>
    </dl>
  );
}
