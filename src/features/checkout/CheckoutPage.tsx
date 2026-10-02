import { useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../cart/CartContext";
import { getCartLines } from "../cart/cart";
import { useProducts } from "../products/ProductContext";
import { ProductStatus } from "../products/ProductStatus";
import { formatMoney } from "../../config/shop";
import {
  deliveryConfig,
  getDeliveryFee,
  type Fulfilment,
} from "../../config/fulfilment";
import {
  getPaymentPhone,
  normalizePhone,
  paymentProviders,
  validatePaymentPhone,
  type PaymentProvider,
} from "./payment";
import { OrderSummary } from "./OrderSummary";
import { EmptyCart } from "../../components/EmptyCart";

export function CheckoutPage() {
  const { items } = useCart();
  const { state } = useProducts();
  const [fulfilment, setFulfilment] = useState<Fulfilment>("delivery");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [reusePhone, setReusePhone] = useState(false);
  const [provider, setProvider] = useState<PaymentProvider>("orange");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const paymentPhone = getPaymentPhone(contactPhone, phone, reusePhone);
  const error =
    touched || reusePhone ? validatePaymentPhone(paymentPhone) : null;
  if (!items.length) return <EmptyCart />;
  if (state.status !== "ready")
    return (
      <section className="wrap page-section">
        <h1>Checkout.</h1>
        <ProductStatus />
      </section>
    );
  const lines = getCartLines(items, state.products);
  if (lines.length !== items.length)
    return (
      <section className="empty-state">
        <h1>Your cart needs a quick update.</h1>
        <p>
          Some products are no longer available. Please remove them before
          continuing.
        </p>
        <Link className="button" to="/cart">
          Review your cart
        </Link>
      </section>
    );
  const deliveryFee = getDeliveryFee(fulfilment, city, zoneId);
  const zone = deliveryConfig.zones.find((zone) => zone.id === zoneId);
  return (
    <section className="wrap page-section">
      <Link to="/cart" className="back-link">
        Back to cart
      </Link>
      <p className="eyebrow">YOUR HOME, CONSIDERED</p>
      <h1>Checkout.</h1>
      <p className="checkout-notice" id="checkout-unavailable">
        <strong>Online ordering is not available yet.</strong>You can explore
        delivery, pickup and payment options. Orders cannot be placed, payments
        cannot be collected or verified, and these details are not saved or
        emailed.
      </p>
      <div className="checkout-grid">
        <form
          onSubmit={(event) => event.preventDefault()}
          aria-label="Checkout information"
        >
          <fieldset>
            <legend>
              01 <span>Contact information</span>
            </legend>
            <div className="form-grid">
              <Field
                label="Full name"
                name="full-name"
                autoComplete="name"
                wide
              />
              <Field
                label="Phone number"
                name="contact-phone"
                type="tel"
                autoComplete="tel"
                value={contactPhone}
                onChange={setContactPhone}
              />
              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
              />
            </div>
          </fieldset>
          <fieldset>
            <legend>
              02 <span>Delivery or pickup</span>
            </legend>
            <div className="choice-group">
              {(["delivery", "pickup"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="fulfilment"
                    value={value}
                    checked={fulfilment === value}
                    onChange={() => setFulfilment(value)}
                  />
                  {value === "delivery" ? "Delivery" : "Pickup"}
                </label>
              ))}
            </div>
            {fulfilment === "delivery" ? (
              <div className="fulfilment-panel" key="delivery">
                <p className="small-note" id="delivery-note">
                  Delivery in Freetown. Choose the zone that best matches your
                  address. These delivery fees are provisional.
                </p>
                <div className="form-grid">
                  <Field
                    label="Street address / landmark"
                  name="address"
                  autoComplete="address-line1"
                  value={address}
                  onChange={setAddress}
                    wide
                  />
                  <Field
                    label="Area / community"
                    name="area"
                    autoComplete="address-level3"
                    value={area}
                    onChange={setArea}
                  />
                  <Field
                    label="City / town"
                    name="city"
                    autoComplete="address-level2"
                    value={city}
                    onChange={setCity}
                  />
                  <div className="sm:col-span-2">
                    <label htmlFor="delivery-zone">Delivery zone *</label>
                    <select
                      id="delivery-zone"
                      name="delivery-zone"
                      required
                      value={zoneId}
                      onChange={(event) => setZoneId(event.target.value)}
                      aria-describedby="zone-help"
                    >
                      <option value="">Choose your delivery zone</option>
                      {deliveryConfig.zones
                        .filter((zone) => zone.active)
                        .map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.coverage} — {formatMoney(zone.fee)}
                          </option>
                        ))}
                    </select>
                    <p className="small-note" id="zone-help" role="status">
                      {zone
                        ? `${zone.coverage}. Delivery: ${formatMoney(zone.fee)}.`
                        : "Select a zone to calculate delivery and your total."}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="instructions">
                      Delivery instructions (optional)
                    </label>
                    <textarea
                      id="instructions"
                      name="instructions"
                      maxLength={500}
                    rows={3}
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    />
                  </div>
                </div>
                {city.trim() && city.trim().toLowerCase() !== "freetown" && (
                  <p className="field-error" role="status">
                    Delivery is currently limited to Freetown.
                  </p>
                )}
              </div>
            ) : (
              <p key="pickup" className="checkout-notice fulfilment-panel">
                Pickup in {deliveryConfig.pickupLocation}. No delivery fee.
              </p>
            )}
          </fieldset>
          <fieldset>
            <legend>
              03 <span>Mobile money</span>
            </legend>
            <div className="choice-group">
              {(["orange", "afri"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="payment-provider"
                    checked={provider === value}
                    onChange={() => setProvider(value)}
                  />
                  {paymentProviders[value].name}
                </label>
              ))}
            </div>
            <div className="form-grid">
              <div className="sm:col-span-2">
                <label htmlFor="payment-phone">Mobile-money number *</label>
                <input
                  id="payment-phone"
                  name="payment-phone"
                  type="tel"
                  autoComplete="off"
                  required
                  maxLength={30}
                  value={paymentPhone}
                  readOnly={reusePhone}
                  onChange={(event) => setPhone(event.target.value)}
                  onBlur={() => {
                    setTouched(true);
                    if (!reusePhone) setPhone(normalizePhone(phone));
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby="payment-help payment-error"
                />
                <label className="phone-reuse" htmlFor="reuse-phone">
                  <input
                    id="reuse-phone"
                    type="checkbox"
                    checked={reusePhone}
                    onChange={(event) => setReusePhone(event.target.checked)}
                  />
                  Use my contact phone number
                </label>
                <p className="small-note" id="payment-help">
                  Enter a Sierra Leone mobile number, for example +23276521208.
                  Number format only; this does not verify registration with the
                  selected provider.
                </p>
                <p className="small-note">
                  When selected, this follows your contact number. Turning it
                  off restores your separately entered payment number.
                </p>
                <p id="payment-error" className="field-error" role="status">
                  {error}
                </p>
              </div>
            </div>
          </fieldset>
          <p className="small-note">
            Required fields are marked *. Payment status remains pending;
            selecting a provider does not initiate payment.
          </p>
        </form>
        <aside className="summary">
          <h2>Your selected pieces</h2>
          <ul className="summary-items">
            {lines.map(({ product, quantity, lineTotal }) => (
              <li key={product.id}>
                <img
                  src={product.image}
                  alt=""
                  style={{ backgroundColor: product.color }}
                />
                <div>
                  <h3>{product.name}</h3>
                  <span>Qty {quantity}</span>
                </div>
                <span>{formatMoney(lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div aria-live="polite">
            <OrderSummary
              subtotal={lines.reduce((sum, line) => sum + line.lineTotal, 0)}
              deliveryFee={deliveryFee}
            />
          </div>
          <button
            type="button"
            className="button w-full"
            disabled
            aria-describedby="checkout-unavailable"
          >
            Place order - unavailable
          </button>
          <p className="small-note">
            Your cart is temporary and clears on refresh.
          </p>
          <Link to="/cart" className="text-link">
            Edit your cart
          </Link>
        </aside>
      </div>
    </section>
  );
}
function Field({
  label,
  name,
  type = "text",
  autoComplete,
  wide = false,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  wide?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={name}>
        {label}
        <span aria-hidden="true"> *</span>
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        maxLength={200}
        value={value}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
      />
    </div>
  );
}
