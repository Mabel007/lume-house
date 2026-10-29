import { CurrencyEstimate } from '../currency/CurrencySelector';
import { CountryCombobox } from '../../components/CountryCombobox';
import { FormField } from '../../components/FormField';
import { HelpDisclosure } from '../../components/HelpDisclosure';
import { variantLabel } from "../products/variants";
import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../cart/CartContext";
import { getCartLines } from "../cart/cart";
import { useProducts } from "../products/ProductContext";
import { ProductStatus } from "../products/ProductStatus";
import { formatMoney, shop } from "../../config/shop";
import {
  deliveryConfig,
  getDeliveryFeeForCountry,
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
import { checkoutMessages, cityProblem, countryProblem, countryValidationCode, isValidEmail } from "./validation";
import { OrderSummary } from "./OrderSummary";
import { EmptyCart } from "../../components/EmptyCart";
import { useAuth } from "../auth/AuthContext";
import { loadProfile } from "../account/profile";
import { getSupabaseClient } from "../../lib/supabase/client";
import { checkoutDefaults } from "./profileDefaults";
import { CheckoutError, placeOrder, placeDirectOrder, recoverCheckout } from '../orders/orderRepository';
import { completeAttempt, readAttempt, rememberAttempt, withCheckoutLock, type CheckoutAttempt } from '../orders/checkoutAttempt';
import { cancelDirectIntent, directCheckoutPath, finishDirectIntent, restoreDirectIntent, type DirectIntent } from './directIntent';
import { prepareCustomerAuthReturn } from '../auth/customerAuthIntent';
import { loadProducts } from '../products/productRepository';

function phoneProblem(value: string, emptyMessage: string): string | undefined {
  if (!value.trim()) return emptyMessage;
  return validatePaymentPhone(value) ? invalidPhoneMessage : undefined;
}

export function CheckoutPage({direct}:{direct?:DirectIntent} = {}) {
  const { items: bagItems, status: bagStatus, retry, beginCheckout, finishCheckout } = useCart();
  const items=direct?[{productId:direct.productId,variantId:direct.variantId,quantity:direct.quantity}]:bagItems;
  const cartStatus=direct?'ready':bagStatus;
  const navigate = useNavigate();
  const auth = useAuth();
  const identity=useRef('');
  const lifetime=`${auth.session?.user.id??'guest'}:${auth.sessionGeneration??0}`;
  useLayoutEffect(()=>{identity.current=lifetime;return()=>{identity.current='';};},[lifetime]);
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
  const [signingIn,setSigningIn]=useState(false);
  const signInGuard=useRef(false);
  const [pendingAttempt,setPendingAttempt]=useState<CheckoutAttempt|null>(null);
  const [recoveryBlocked,setRecoveryBlocked]=useState(false);
  const requestId=useRef<string|null>(null);
  const [fulfilment, setFulfilment] = useState<Fulfilment>("delivery");
  const [countryCode, setCountryCode] = useState(deliveryConfig.serviceCountryCode);
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
  function current(){return mounted.current&&identity.current===lifetime;}
  function accepted(id:string,attempt:CheckoutAttempt,ticket?:number|null){
    if(!current())return;
    try{completeAttempt(attempt.ownerId,attempt.requestId);}catch{/* Accepted order remains recoverable. */}
    if(direct){try{finishDirectIntent(direct.id);}catch{/* Preserve selection if storage is unavailable. */}}
    else {
      // An accepted ID may be an older replay. Only the server knows which Bag
      // converted; reconcile its current state instead of clearing newer items.
      finishCheckout?.(false,ticket);retry?.();
    }
    navigate(`/orders/${id}/success`,{replace:true});
  }
  async function checkPrevious(attempt:CheckoutAttempt){
    setRecovering(true);setOrderError('');
    try{
      const id=await recoverCheckout(getSupabaseClient(),attempt);
      if(!current())return;
      if(id)accepted(id,attempt);
      else setOrderError('No completed result is visible yet. Your request is retained: review this checkout and retry the same request, or check My Orders.');
    }catch{if(current())setOrderError('The previous checkout could not be verified. Its request is retained; check My Orders or retry checking.');}
    finally{if(current())setRecovering(false);}
  }
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const node = document.getElementById(target);
    if (node && typeof node.focus === "function") node.focus();
  }, [focusRequest]);
  useEffect(()=>{
    let active=true;
    void (async()=>{
    await Promise.resolve();if(!active)return;
    if(userId)try{
      const saved=readAttempt(userId,direct?'direct':'bag');setPendingAttempt(saved);
      if(saved){
        if(saved.source!==(direct?'direct':'bag')||saved.source==='direct'&&saved.intentId!==direct?.id){setRecoveryBlocked(true);return;}
        requestId.current=saved.requestId;
        void (async()=>{if(active)await checkPrevious(saved);})();
      }
    }catch{setRecoveryBlocked(true);setOrderError('Checkout recovery storage is unavailable or inconsistent. Keep this browser data and check My Orders before starting another purchase.');}
    })();
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
  // Pickup is always the domestic Lumley location. Delivery sends the
  // canonical code only after the selected country passes the existing gate.
  const submittedCountry =
    fulfilment === "pickup"
      ? deliveryConfig.serviceCountryCode
      : countryProblem(countryCode, deliveryConfig.serviceCountryCode)
        ? null
        : deliveryConfig.serviceCountryCode;
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
    const countryMessage = countryProblem(
      countryCode,
      deliveryConfig.serviceCountryCode,
    );
    if (countryMessage)
      problems.push({ id: "delivery-country", message: countryMessage });
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
  // Immediate, accessible feedback for a non-blank delivery city we cannot
  // serve. Blank cities keep the quieter blur-gated behaviour; the database
  // stays authoritative on real orders.
  const unsupportedCity =
    fulfilment === "delivery" &&
    city.trim() !== "" &&
    cityProblem(city, deliveryConfig.serviceCity) ===
      checkoutMessages.unsupportedCity;
  const unsupportedCountry =
    fulfilment === "delivery" &&
    countryCode !== "" &&
    countryProblem(countryCode, deliveryConfig.serviceCountryCode) ===
      checkoutMessages.unsupportedCountry;
  const problemFor = (id: string) =>
    problems.find((problem) => problem.id === id)?.message;
  const markTouched = (id: string) =>
    setTouchedFields(current => current[id] ? current : { ...current, [id]: true });
  const showsError = (id: string) => attempted || touchedFields[id] === true;
  const fullNameError = showsError("full-name") ? problemFor("full-name") : undefined;
  const emailError = showsError("email") ? problemFor("email") : undefined;
  const addressError = showsError("address") ? problemFor("address") : undefined;
  const areaError = showsError("area") ? problemFor("area") : undefined;
  const countryError =
    showsError("delivery-country") || unsupportedCountry
      ? problemFor("delivery-country")
      : undefined;
  const cityError =
    showsError("city") || unsupportedCity ? problemFor("city") : undefined;
  const zoneError = showsError("delivery-zone") ? problemFor("delivery-zone") : undefined;
  const paymentError =
    reusePhone || showsError("payment-phone") ? problemFor("payment-phone") : undefined;
  const contactError = showsError("contact-phone")
    ? problemFor("contact-phone")
    : undefined;
  async function submit(event:React.FormEvent) {
    event.preventDefault();
    if(submittingRef.current||recovering||recoveryBlocked||state.status!=='ready'||!userId)return;
    setAttempted(true);
    if(problems.length){
      pendingFocus.current=problems[0].id;
      setFocusRequest(value=>value+1);
      const phonesOnly=problems.every(problem=>problem.id==='contact-phone'||problem.id==='payment-phone');
      setOrderError(phonesOnly?'Enter valid 8-digit Sierra Leone contact and payment numbers.':'Please check your contact and delivery details before placing your order.');
      return;
    }
    if(!submittedCountry){setOrderError(checkoutMessages.unsupportedCountry);return;}
    const checkoutTicket=direct?null:beginCheckout?.();
    if(!direct && beginCheckout && checkoutTicket==null){setOrderError('Wait for your Cart changes to finish saving.');return;}
    submittingRef.current=true;setSubmitting(true);setOrderError('');
    let hadPending=false;
    try {
      await withCheckoutLock(userId,!!direct,async()=>{
        if(!current())return;
        const existing=readAttempt(userId,direct?'direct':'bag');hadPending=!!existing;
        if(existing)setPendingAttempt(existing);
        if(existing&&(existing.source!==(direct?'direct':'bag')||existing.source==='direct'&&existing.intentId!==direct?.id))throw new Error('OTHER_CHECKOUT_PENDING');
        if(existing){
          setPendingAttempt(existing);
          const id=await recoverCheckout(getSupabaseClient(),existing);
          if(!current())return;
          if(id){accepted(id,existing,checkoutTicket);return;}
        }
        let expected=getCartLines(items,state.products).map(({product,variant,quantity})=>({product_id:product.id,variant_id:variant!.id,quantity,unit_price:product.price})).sort((a,b)=>a.variant_id.localeCompare(b.variant_id));
        if(direct){
          if(direct.ownerId!==userId)throw new CheckoutError('AUTH_REQUIRED');
          const fresh=await loadProducts(getSupabaseClient(),shop.currency,new AbortController().signal).catch(()=>{throw new CheckoutError('CATALOG_UNAVAILABLE');});
          if(!current())return;
          const freshLines=getCartLines(items,fresh);
          if(freshLines.length!==1||!freshLines[0].product.variants){refresh();throw new CheckoutError('PRODUCT_UNAVAILABLE');}
          if(expected.length!==1||freshLines[0].product.price!==expected[0].unit_price){refresh();throw new CheckoutError('QUOTE_CHANGED');}
          expected=[{product_id:freshLines[0].product.id,variant_id:freshLines[0].variant!.id,quantity:direct.quantity,unit_price:freshLines[0].product.price}];
        }
        const candidate:CheckoutAttempt=direct
          ?{version:1,source:'direct',ownerId:userId,requestId:direct.id,intentId:direct.id,productId:direct.productId,variantId:direct.variantId,quantity:direct.quantity}
          :{version:1,source:'bag',ownerId:userId,requestId:existing?.requestId||requestId.current||crypto.randomUUID()};
        const attempt=rememberAttempt(candidate);requestId.current=attempt.requestId;setPendingAttempt(attempt);
        const checkout={full_name:fullName,email,contact_phone:normalizePhone(contactPhone),payment_phone:normalizePhone(paymentPhone),provider,fulfilment,country_code:submittedCountry,zone_id:zoneId,street:address,area,city,instructions};
        const result=attempt.source==='direct'
          ?await placeDirectOrder(getSupabaseClient(),attempt,checkout,expected[0])
          :await placeOrder(getSupabaseClient(),attempt.requestId,checkout,expected,userId);
        accepted(result.id,attempt,checkoutTicket);
      });
    }catch(error){
      if(!direct)finishCheckout?.(false,checkoutTicket);
      if(!current())return;
      const code=error instanceof CheckoutError?error.code:'ORDER_UNAVAILABLE';
      if(direct&&error instanceof CheckoutError&&error.definitive&&!hadPending&&!['CHECKOUT_SOURCE_CONFLICT','CHECKOUT_SELECTION_CONFLICT'].includes(code)){
        try{completeAttempt(userId,direct.id);setPendingAttempt(null);}catch{/* Keep recovery if cleanup cannot be confirmed. */}
      }
      if(error instanceof Error&&['OTHER_CHECKOUT_PENDING','CHECKOUT_RECOVERY_INVALID'].includes(error.message)){setRecoveryBlocked(true);setOrderError('Another checkout is unresolved. Check its result before starting this purchase.');}
      else if(error instanceof Error&&error.message==='CHECKOUT_LOCK_UNAVAILABLE')setOrderError('This browser cannot coordinate a safe Buy Now checkout. Use a current browser with Web Locks support.');
      else if(error instanceof Error&&error.message==='CHECKOUT_BUSY')setOrderError('Checkout is active in another tab. Wait for it to finish, then check the previous order.');
      else if(['CART_CHANGED','PRODUCT_UNAVAILABLE','EMPTY_CART','OUT_OF_STOCK','QUOTE_CHANGED'].includes(code)){setOrderError(direct?'The selected price or availability changed. Review the refreshed selection before retrying. Any previous request is retained.':code==='OUT_OF_STOCK'?'A selected quantity is no longer available. Review your Cart and current availability before trying again.':'Your Cart or current prices changed. Review the refreshed Cart before placing your order.');refresh();if(!direct)retry?.();}
      else if(code==='AUTH_REQUIRED')setOrderError('Your session expired. Please sign in again before placing your order.');
      else if(code===countryValidationCode)setOrderError(checkoutMessages.unsupportedCountry);
      else if(code==='DIRECT_UNAVAILABLE')setOrderError('Buy Now is unavailable on this server. Your request is retained; check My Orders or retry checking.');
      else if(code==='CATALOG_UNAVAILABLE')setOrderError('Current prices could not be checked. Your selection and any previous request are retained. Retry when product services are available.');
      else if(['CHECKOUT_SOURCE_CONFLICT','CHECKOUT_SELECTION_CONFLICT'].includes(code)){setRecoveryBlocked(true);setOrderError('This request belongs to a different checkout. Check My Orders before continuing.');}
      else if(code.startsWith('INVALID_'))setOrderError('Please check your contact, payment and Freetown delivery details.');
      else setOrderError('We could not confirm order placement. Your retry uses the same request to prevent duplicates. Check My Orders or try again.');
    }finally{submittingRef.current=false;if(current())setSubmitting(false);}
  }
  async function directSignIn(){if(signInGuard.current)return;signInGuard.current=true;setSigningIn(true);try{prepareCustomerAuthReturn();await auth.signIn();}catch{if(current())setOrderError('Sign-in continuation could not be saved. Please keep this tab and retry.');}finally{signInGuard.current=false;if(current())setSigningIn(false);}}
  function cancelSelection(){try{cancelDirectIntent();navigate(direct?`/products/${encodeURIComponent(direct.productId)}`:'/');}catch{setOrderError('Checkout selection could not be cleared. Please retry.');}}
  const recoveryControls=pendingAttempt&&<div className="checkout-notice"><p>A previous checkout request is retained until its result is confirmed.</p><button type="button" className="text-link" disabled={recovering||submitting} onClick={()=>void checkPrevious(pendingAttempt)}>Check previous order</button> <Link to="/account/orders">My Orders</Link></div>;
  if(recoveryBlocked)return <section className="wrap page-section"><h1>Review your previous checkout.</h1><p role="alert">{orderError||'An unresolved checkout must be reviewed before starting another purchase.'}</p>{pendingAttempt?.source==='direct'?<button type="button" className="button" onClick={()=>{restoreDirectIntent({id:pendingAttempt.intentId,productId:pendingAttempt.productId,variantId:pendingAttempt.variantId,quantity:pendingAttempt.quantity,ownerId:pendingAttempt.ownerId});navigate(directCheckoutPath);}}>Resume Buy Now</button>:<Link className="button" to="/cart">Return to your Cart</Link>} <Link to="/account/orders">Check My Orders</Link></section>;
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
        <h1>{direct?'Your selected piece is unavailable.':'Your Cart needs a quick update.'}</h1>
        <p>
          Some products are no longer available. Please remove them before
          continuing.
        </p>
        {direct&&recoveryControls}
        {direct&&<button type="button" className="text-link" onClick={refresh}>Check availability again</button>}
        {direct&&<button type="button" className="text-link" disabled={!!pendingAttempt||submitting} onClick={cancelSelection}>Cancel selection</button>}
        <Link className="button" to={direct?`/products/${encodeURIComponent(direct.productId)}`:'/cart'}>
          {direct?'Back to product':'Review your Cart'}
        </Link>
      </section>
    );
  const deliveryFee = getDeliveryFeeForCountry(
    fulfilment,
    countryCode,
    city,
    zoneId,
  );
  const zone = deliveryConfig.zones.find((zone) => zone.id === zoneId);
  return (
    <section className="wrap page-section">
      <Link to={direct?`/products/${encodeURIComponent(direct.productId)}`:'/cart'} className="back-link">
        {direct?'Back to product':'Back to Cart'}
      </Link>
      <p className="eyebrow">YOUR HOME, CONSIDERED</p>
      <h1>Checkout.</h1>
      {direct&&<p className="checkout-notice">Buy Now — only this selected piece will be ordered. Your saved Cart is kept separate.</p>}
      <p className="checkout-notice" id="checkout-payment"><strong>Payment awaits confirmation.</strong>Placing an order saves your order and requests a confirmation email. Selecting mobile money does not charge or verify your account.</p>
      {orderError&&<p role="alert" className="field-error">{orderError}</p>}
      {direct&&auth.error&&<p role="alert" className="field-error">{auth.error}</p>}
      {recoveryControls}
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
                hint="Enter an 8-digit Sierra Leone phone number."
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
              <HelpDisclosure label="Number format help" id="phone-format">
                <p>
                  Accepted formats include numbers with or without a leading 0
                  or +232; spaces and dashes are removed automatically.
                </p>
                <p>Example: 0XX XXX XXX.</p>
              </HelpDisclosure>
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
                  Delivery in {deliveryConfig.serviceCity}, {deliveryConfig.serviceCountry}.
                  Choose the zone that best matches your address. These delivery
                  fees are provisional.
                </p>
                <div className="form-grid">
                  <div className="sm:col-span-2">
                    <CountryCombobox
                      id="delivery-country"
                      name="delivery-country"
                      label="Delivery country"
                      value={countryCode}
                      onChange={setCountryCode}
                      onBlur={() => markTouched("delivery-country")}
                      hint={`We currently deliver within ${deliveryConfig.serviceCity}, ${deliveryConfig.serviceCountry} only.`}
                      error={countryError}
                    />
                  </div>
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
                  {unsupportedCity && (
                    <div className="sm:col-span-2">
                      <p
                        className="small-note"
                        id="delivery-unavailable-note"
                        role="status"
                      >
                        Place Order stays unavailable while the delivery city is
                        outside our delivered areas in {deliveryConfig.serviceCity}.
                      </p>
                    </div>
                  )}
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
                    value={value}
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
                  Use my contact number
                </label>
                <p className="small-note" id="payment-help">
                  Enter the payer’s 8-digit Sierra Leone mobile-money
                  number.
                </p>
                <HelpDisclosure label="Payment number details" id="payment-details">
                  <p>
                    Accepted formats include numbers with or without a leading 0
                    or +232. Example: 0XX XXX XXX.
                  </p>
                  <p>
                    Number format only; this does not verify registration with
                    the selected provider.
                  </p>
                  <p>
                    With “Use my contact number” selected, this number follows
                    your contact number. Turning it off restores your separately
                    entered payment number.
                  </p>
                </HelpDisclosure>
                <p id="payment-error" className="field-error">
                  {paymentError}
                </p>
              </div>
            </div>
          </fieldset>
          <p className="small-note">
            Required fields are marked *. Payment awaits confirmation after placement;
            selecting a provider does not initiate payment.
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
                <span>{formatMoney(lineTotal)}<CurrencyEstimate minorUnits={lineTotal} /></span>
              </li>
            ))}
          </ul>
          <div aria-live="polite">
            <OrderSummary
              subtotal={lines.reduce((sum, line) => sum + line.lineTotal, 0)}
              deliveryFee={deliveryFee}
              deliveryUnavailable={unsupportedCountry}
              estimates
            />
          </div>
          {auth.session ? (
            <button
              type="submit"
              form="checkout-form"
              className="button w-full"
              disabled={submitting || cartStatus==='saving' || cartStatus==='loading' || cartStatus==='error' || recovering || deliveryFee===null}
              aria-describedby={
                [
                  unsupportedCountry ? "delivery-country-error" : undefined,
                  unsupportedCity ? "delivery-unavailable-note" : undefined,
                  "checkout-payment",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
            >
              {submitting?'Placing order…':'Place order'}
            </button>
          ) : auth.loading ? (
            <p className="small-note" role="status">Restoring your session…</p>
          ) : (
            direct?<button type="button" className="button w-full" disabled={signingIn} onClick={()=>void directSignIn()} aria-describedby="checkout-payment">{signingIn?'Opening Google sign-in…':'Sign in with Google to continue'}</button>:<Link className="button w-full" to="/account" aria-describedby="checkout-payment">Sign in to place your order</Link>
          )}
          <p className="small-note">
            {auth.session ? "Your checkout details will be saved with this order, independently of your profile." : auth.loading ? "Checking your session before order placement." : "An account is required before you can place your order."}
          </p>
          {direct?<button type="button" className="text-link" disabled={submitting||!!pendingAttempt} onClick={cancelSelection}>Cancel selection</button>:<Link to="/cart" className="text-link">Edit your Cart</Link>}
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
