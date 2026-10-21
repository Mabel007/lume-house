import { FormField } from '../../components/FormField';
import { variantLabel } from "../products/variants";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  invalidPhoneMessage,
  normalizePhone,
  paymentProviders,
  validatePaymentPhone,
  type PaymentProvider,
} from "./payment";
import { checkoutMessages, cityProblem, isValidEmail } from "./validation";
import { OrderSummary } from "./OrderSummary";
import { EmptyCart } from "../../components/EmptyCart";
import { useAuth } from "../auth/AuthContext";
import { loadProfile } from "../account/profile";
import { getSupabaseClient } from "../../lib/supabase/client";
import { checkoutDefaults } from "./profileDefaults";
import { CheckoutError, findCheckout, placeOrder } from '../orders/orderRepository';
import { clearRequest,pendingRequest,rememberRequest } from '../orders/pendingCheckout';

function phoneProblem(value: string, emptyMessage: string): string | undefined {
  if (!value.trim()) return emptyMessage;
  return validatePaymentPhone(value) ? invalidPhoneMessage : undefined;
}

export function CheckoutPage() {
  const { items, status: cartStatus, retry, beginCheckout, finishCheckout } = useCart();
  const navigate = useNavigate();
  const auth = useAuth();
  const dirty = useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [profileNote, setProfileNote] = useState("");
  const { state, refresh } = useProducts();
  const [submitting,setSubmitting] = useState(false);
  const submittingRef=useRef(false);
  const [orderError,setOrderError]=useState('');
  const [recovering,setRecovering]=useState(false);
  const requestId=useRef<string|null>(null);
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
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const pendingFocus = useRef<string | null>(null);
  const userId = auth.session?.user.id;
  const userEmail = auth.session?.user.email;
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const node = document.getElementById(target);
    if (node && typeof node.focus === "function") node.focus();
  }, [focusRequest]);
  useEffect(()=>{
    let active=true;
    const saved=userId?pendingRequest(userId):null;
    if(saved && userId) {
      requestId.current=saved;
      void (async()=>{
        setRecovering(true);
        try {
          const id=await findCheckout(getSupabaseClient(),saved);
          if(active&&id){clearRequest(userId);retry?.();navigate(`/orders/${id}/success`,{replace:true});}
        }catch{if(active)setOrderError('A previous checkout could not be checked. Retry with the same request, or check My Orders before starting another.');}
        finally{if(active)setRecovering(false);}
      })();
    }
    return()=>{active=false};
    // Identity-keyed route mounts once; callbacks must not restart recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[userId,navigate]);
  useEffect(() => {
    let active = true;
    if (userId) void loadProfile(getSupabaseClient(), userId).then(profile => {
      if (!active || dirty.current) return;
      const defaults = checkoutDefaults(profile, userEmail || "");
      setEmail(defaults.email);
      if (profile) {
        setFullName(defaults.fullName); setContactPhone(defaults.contactPhone);
        setAddress(defaults.address); setArea(defaults.area); setCity(defaults.city);
        setProfileNote("Your profile defaults are filled in. Checkout edits apply here only.");
      }
    }).catch(() => { if (active) setProfileNote("Profile defaults could not be loaded. Please enter your checkout details."); });
    return () => { active = false; };
  }, [userId, userEmail]);
  const paymentPhone = getPaymentPhone(contactPhone, phone, reusePhone);
  // Ordered as the form renders so the first problem is also the first field to
  // focus. Text rules mirror the trusted SQL; the database stays authoritative.
  const problems: { id: string; message: string }[] = [];
  if (!fullName.trim())
    problems.push({ id: "full-name", message: checkoutMessages.fullName });
  const contactPhoneProblem = phoneProblem(contactPhone, checkoutMessages.contactPhone);
  if (contactPhoneProblem)
    problems.push({ id: "contact-phone", message: contactPhoneProblem });
  if (!email.trim())
    problems.push({ id: "email", message: checkoutMessages.email });
  else if (!isValidEmail(email))
    problems.push({ id: "email", message: checkoutMessages.emailFormat });
  if (fulfilment === "delivery") {
    if (!address.trim())
      problems.push({ id: "address", message: checkoutMessages.address });
    if (!area.trim())
      problems.push({ id: "area", message: checkoutMessages.area });
    const cityMessage = cityProblem(city, deliveryConfig.serviceCity);
    if (cityMessage) problems.push({ id: "city", message: cityMessage });
    if (!zoneId)
      problems.push({ id: "delivery-zone", message: checkoutMessages.zone });
  }
  const paymentPhoneProblem = phoneProblem(paymentPhone, checkoutMessages.paymentPhone);
  if (paymentPhoneProblem)
    problems.push({ id: "payment-phone", message: paymentPhoneProblem });
  const problemFor = (id: string) =>
    problems.find((problem) => problem.id === id)?.message;
  const markTouched = (id: string) =>
    setTouchedFields(current => current[id] ? current : { ...current, [id]: true });
  const showsError = (id: string) => attempted || touchedFields[id] === true;
  const fullNameError = showsError("full-name") ? problemFor("full-name") : undefined;
  const emailError = showsError("email") ? problemFor("email") : undefined;
  const addressError = showsError("address") ? problemFor("address") : undefined;
  const areaError = showsError("area") ? problemFor("area") : undefined;
  const cityError = showsError("city") ? problemFor("city") : undefined;
  const zoneError = showsError("delivery-zone") ? problemFor("delivery-zone") : undefined;
  const paymentError =
    reusePhone || showsError("payment-phone") ? problemFor("payment-phone") : undefined;
  const contactError = showsError("contact-phone")
    ? problemFor("contact-phone")
    : undefined;
  async function submit(event:React.FormEvent) {
    event.preventDefault();
    if(submittingRef.current||state.status!=='ready'||!userId)return;
    setAttempted(true);
    if(problems.length){
      pendingFocus.current=problems[0].id;
      setFocusRequest(value=>value+1);
      const phonesOnly=problems.every(problem=>problem.id==='contact-phone'||problem.id==='payment-phone');
      setOrderError(phonesOnly?'Enter valid 8-digit Sierra Leone contact and payment numbers.':'Please check your contact and delivery details before placing your order.');
      return;
    }
    const checkoutTicket=beginCheckout?.();
    if(beginCheckout && checkoutTicket==null){setOrderError('Wait for your Cart changes to finish saving.');return;}
    submittingRef.current=true;setSubmitting(true);setOrderError('');
    requestId.current ||= pendingRequest(userId)||crypto.randomUUID();
    rememberRequest(userId,requestId.current);
    try {
      const expected=getCartLines(items,state.products).map(({product,variant,quantity})=>({product_id:product.id,variant_id:variant!.id,quantity,unit_price:product.price})).sort((a,b)=>a.variant_id.localeCompare(b.variant_id));
      const result=await placeOrder(getSupabaseClient(),requestId.current,{full_name:fullName,email,contact_phone:normalizePhone(contactPhone),payment_phone:normalizePhone(paymentPhone),provider,fulfilment,zone_id:zoneId,street:address,area,city,instructions},expected,userId);
      clearRequest(userId);finishCheckout?.(true,checkoutTicket);
      if(mounted.current)navigate(`/orders/${result.id}/success`,{replace:true});
    }catch(error){
      finishCheckout?.(false,checkoutTicket);
      const code=error instanceof CheckoutError?error.code:'ORDER_UNAVAILABLE';
      if(['CART_CHANGED','PRODUCT_UNAVAILABLE','EMPTY_CART','OUT_OF_STOCK'].includes(code)){setOrderError(code==='OUT_OF_STOCK'?'A selected quantity is no longer available. Review your Cart and current availability before trying again.':'Your Cart or current prices changed. Review the refreshed Cart before placing your order.');refresh();retry?.();}
      else if(code==='AUTH_REQUIRED')setOrderError('Your session expired. Please sign in again before placing your order.');
      else if(code.startsWith('INVALID_'))setOrderError('Please check your contact, payment and Freetown delivery details.');
      else setOrderError('We could not confirm order placement. Your retry uses the same request to prevent duplicates. Check My Orders or try again.');
    }finally{submittingRef.current=false;setSubmitting(false);}
  }
  if(recovering)return <section className="wrap page-section"><h1>Checking your order…</h1><p role="status">Restoring the result of your previous checkout.</p></section>;
  if (cartStatus === "loading" || cartStatus === "error") return <section className="wrap page-section"><h1>Checkout.</h1><p>Waiting for your saved Cart.</p></section>;
  if (!items.length) return orderError ? <section className="wrap page-section"><p role="alert">{orderError}</p><Link to="/account/orders">Check My Orders</Link></section> : <EmptyCart />;
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
        <h1>Your Cart needs a quick update.</h1>
        <p>
          Some products are no longer available. Please remove them before
          continuing.
        </p>
        <Link className="button" to="/cart">
          Review your Cart
        </Link>
      </section>
    );
  const deliveryFee = getDeliveryFee(fulfilment, city, zoneId);
  const zone = deliveryConfig.zones.find((zone) => zone.id === zoneId);
  return (
    <section className="wrap page-section">
      <Link to="/cart" className="back-link">
        Back to Cart
      </Link>
      <p className="eyebrow">YOUR HOME, CONSIDERED</p>
      <h1>Checkout.</h1>
      <p className="checkout-notice" id="checkout-payment"><strong>Payment awaits confirmation.</strong>Placing an order saves your order and requests a confirmation email. Selecting mobile money does not charge or verify your account.</p>
      {orderError&&<p role="alert" className="field-error">{orderError}</p>}
      <div className="checkout-grid">
        <form
          id="checkout-form"
          noValidate
          onChange={() => { dirty.current = true; }}
          onSubmit={event=>void submit(event)}
          aria-busy={submitting}
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
                value={fullName}
                onChange={setFullName}
                onBlur={() => markTouched("full-name")}
                error={fullNameError}
                wide
              />
              <Field
                label="Phone number"
                name="contact-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={contactPhone}
                onChange={setContactPhone}
                onBlur={event => {
                  markTouched("contact-phone");
                  setContactPhone(normalizePhone(event.currentTarget.value));
                }}
                hint="Enter an 8-digit Sierra Leone phone number, with or without 0 or +232. Example: 0XX XXX XXX."
                error={contactError ?? undefined}
              />
              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={setEmail}
                onBlur={() => markTouched("email")}
                error={emailError}
              />
            </div>
            <p className="small-note" role="status">{profileNote || (!auth.session ? "Sign in to use your saved profile defaults. Online order placement will require an account." : "Checkout edits do not change your saved profile.")}</p>
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
                    onBlur={() => markTouched("address")}
                    error={addressError}
                    wide
                  />
                  <Field
                    label="Area / community"
                    name="area"
                    autoComplete="address-level3"
                    value={area}
                    onChange={setArea}
                    onBlur={() => markTouched("area")}
                    error={areaError}
                  />
                  <Field
                    label="City / town"
                    name="city"
                    autoComplete="address-level2"
                    value={city}
                    onChange={setCity}
                    list="delivery-city-options"
                    aria-describedby="delivery-city-help"
                    error={cityError}
                    onBlur={() => markTouched("city")}
                  />
                  <div className="sm:col-span-2">
                    <label htmlFor="delivery-zone">Delivery zone *</label>
                    <select
                      id="delivery-zone"
                      name="delivery-zone"
                      required
                      value={zoneId}
                      onChange={(event) => setZoneId(event.target.value)}
                      onBlur={() => markTouched("delivery-zone")}
                      aria-invalid={zoneError ? true : undefined}
                      aria-describedby={
                        zoneError ? "zone-help delivery-zone-error" : "zone-help"
                      }
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
                    {zoneError && (
                      <p className="field-error" id="delivery-zone-error">
                        {zoneError}
                      </p>
                    )}
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
                <datalist id="delivery-city-options">
                  <option value={deliveryConfig.serviceCity} />
                </datalist>
                <p className="small-note" id="delivery-city-help">
                  We currently deliver within {deliveryConfig.serviceCity} only.
                </p>
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
                  inputMode="tel"
                  required
                  maxLength={30}
                  value={paymentPhone}
                  readOnly={reusePhone}
                  onChange={(event) => setPhone(event.target.value)}
                  onBlur={(event) => {
                    markTouched("payment-phone");
                    if (!reusePhone) setPhone(normalizePhone(event.currentTarget.value));
                  }}
                  aria-invalid={paymentError ? true : undefined}
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
                  Any Sierra Leone mobile network is accepted. Use 8 digits, with
                  or without 0 or +232. Example: 0XX XXX XXX. Number format only;
                  this does not verify registration with the selected provider.
                </p>
                <p className="small-note">
                  When selected, this follows your contact number. Turning it
                  off restores your separately entered payment number.
                </p>
                <p id="payment-error" className="field-error">
                  {paymentError}
                </p>
              </div>
            </div>
          </fieldset>
          <p className="small-note">
            Required fields are marked *. Payment awaits confirmation after placement;
            selecting a provider does not initiate payment. Checkout edits do not update your profile.
          </p>
        </form>
        <aside className="summary">
          <h2>Your selected pieces</h2>
          <ul className="summary-items">
            {lines.map(({ product, variant, quantity, lineTotal, lineKey }) => (
              <li key={lineKey}>
                <img
                  src={product.image}
                  alt=""
                  style={{ backgroundColor: product.color }}
                />
                <div>
                  <h3>{product.name}</h3>
                  {variant && variantLabel(variant) && <p>{variantLabel(variant)}</p>}
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
          {auth.session ? (
            <button
              type="submit"
              form="checkout-form"
              className="button w-full"
              disabled={submitting || cartStatus==='saving' || cartStatus==='loading' || cartStatus==='error' || recovering || deliveryFee===null}
              aria-describedby="checkout-payment"
            >
              {submitting?'Placing order…':'Place order'}
            </button>
          ) : auth.loading ? (
            <p className="small-note" role="status">Restoring your session…</p>
          ) : (
            <Link className="button w-full" to="/account" aria-describedby="checkout-payment">Sign in to place your order</Link>
          )}
          <p className="small-note">
            {auth.session ? "Your checkout details will be saved with this order, independently of your profile." : auth.loading ? "Checking your session before order placement." : "An account is required before you can place your order."}
          </p>
          <Link to="/cart" className="text-link">
            Edit your Cart
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
  hint,
  error,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  wide?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  hint?: string;
  error?: string;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "label" | "name" | "type" | "autoComplete" | "wide" | "value" | "onChange" | "hint" | "error"
>) {
  return <FormField label={label} name={name} id={name} type={type} autoComplete={autoComplete} wide={wide} required maxLength={200} value={value} onChange={onChange ? event=>onChange(event.target.value) : undefined} hint={hint} error={error} {...rest}/>;
}