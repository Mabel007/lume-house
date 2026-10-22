import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useCart } from "./CartContext";
import { getCartLines, cartLineKey, MAX_QUANTITY } from "./cart";
import { bagRemovedText, bagRemoveFailedText } from "./bagFeedback";
import { useNotifications } from "../../components/notifications";
import { useProducts } from "../products/ProductContext";
import { ProductStatus } from "../products/ProductStatus";
import { UnavailableItems } from "./UnavailableItems";
import { formatMoney } from "../../config/shop";
import { EmptyCart } from "../../components/EmptyCart";
import { variantLabel } from "../products/variants";
import { OrderSummary } from "../checkout/OrderSummary";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from '../../components/PageHeader';
import { UiStatus } from '../../components/UiStatus';

export function CartPage() {
  const { items, dispatch, status } = useCart();
  const { notify } = useNotifications();
  const auth = useAuth();
  const noticeSeq = useRef(0);
  const alive = useRef(true);
  // Reset on (re)mount: StrictMode dev runs cleanup then re-runs the effect,
  // and the guard must stay live for the remounted component.
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const listRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const consumedFocus = useRef(0);
  const cancelledFocus = useRef(0);
  const [pendingFocus, setPendingFocus] = useState<{ index: number; operation: number; control: HTMLElement } | null>(null);
  useEffect(() => {
    if (!pendingFocus || consumedFocus.current === pendingFocus.operation) return;
    consumedFocus.current = pendingFocus.operation;
    if (pendingFocus.operation !== noticeSeq.current || pendingFocus.operation === cancelledFocus.current) return;
    const active = document.activeElement;
    if (active !== pendingFocus.control && active !== document.body) return;
    const controls = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-cart-remove]");
    if (controls && controls.length > 0) {
      controls[Math.min(pendingFocus.index, controls.length - 1)].focus();
      return;
    }
    emptyRef.current?.querySelector<HTMLElement>("[data-cart-empty-title]")?.focus();
  }, [pendingFocus]);
  async function removeLine(
    product: { id: string; name: string },
    variantId: string | undefined,
    variantDetail: string,
    control?: HTMLElement | null,
    index?: number,
  ) {
    noticeSeq.current += 1;
    const operation = noticeSeq.current;
    const hadFocus = !!control && document.activeElement === control;
    const outcome = await dispatch({ type: "remove", productId: product.id, variantId });
    if (!alive.current || operation !== noticeSeq.current) return;
    if (outcome.kind === "confirmed") {
      notify({ tone: "success", message: bagRemovedText(product.name, variantDetail) });
      if (hadFocus && control && index !== undefined) setPendingFocus({ index, operation, control });
    } else if (outcome.kind === "rejected") notify({ tone: "error", message: bagRemoveFailedText(product.name, outcome.failure) });
  }
  const busy = status === "saving" || status === "loading" || status === "error" || status === "checking-out";
  const { state } = useProducts();
  const trail = [{ label: 'Shop', to: '/' }];
  if (status === "loading" || status === "checking-out") return <section className="wrap page-section"><PageHeader title="Your Cart." trail={trail} /><UiStatus kind="loading">Your saved Cart is not ready yet.</UiStatus></section>;
  if (status === "error" && state.status !== "ready")
    return (
      <section className="wrap page-section">
        <PageHeader title="Your Cart." trail={trail}/>
        <ProductStatus />
      </section>
    );
  if (status === "error") return <section className="wrap page-section"><PageHeader title="Your Cart." trail={trail} /><UiStatus kind="error">Your saved Cart is not ready yet.</UiStatus></section>;
  if (!items.length) return <div ref={emptyRef}><EmptyCart /></div>;
  if (state.status !== "ready")
    return (
      <section className="wrap page-section">
        <PageHeader title="Your Cart." trail={trail} />
        <ProductStatus />
      </section>
    );
  const products = state.products;
  const lines = getCartLines(items, products);
  const unavailable = items.filter(
    (item) => !lines.some(line => line.lineKey === cartLineKey(item)),
  );
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return (
    <section className="wrap page-section">
      <p className="eyebrow">YOUR EVERYDAY FINDS</p>
      <PageHeader title="Your Cart." description="Review your pieces before checkout." trail={trail}/>
      <p className="muted mb-8">
        {auth.session ? items.some(item=>!item.variantId) ? "Available selections are saved to your account. Unavailable guest items are retained in this browser until removed." : "Your Cart is saved to your account." : "Sign in to save your Cart across visits. Guest items are kept only in this browser tab."}
      </p>
      <div className="checkout-grid">
        <div ref={listRef}>
          {unavailable.length > 0 && <UnavailableItems items={unavailable} />}
          {lines.map(({ product, variant, item, quantity, lineTotal, lineKey }, index) => {
            const label=product.name+(variant&&variantLabel(variant)?`, ${variantLabel(variant)}`:'');
            return (
            <article className="cart-row" key={lineKey}>
              <img
                src={product.image}
                alt={product.image.endsWith(".svg") ? `Illustration of ${product.name}` : product.name}
                style={{ backgroundColor: product.color }}
              />
              <div className="cart-row-detail">
                <p className="product-category">{product.category}</p>
                <h2><Link to={`/products/${encodeURIComponent(product.id)}`}>{product.name}</Link></h2>
                {variant && variantLabel(variant) && <p>{variantLabel(variant)}</p>}
                <p>{formatMoney(product.price)} each</p>
                <div className="quantity-actions">
                  <div className="quantity-control">
                    <button
                      aria-label={`Decrease ${label} quantity`}
                      disabled={busy || quantity === 1}
                      onClick={() =>
                        dispatch({
                          type: "quantity",
                          productId: product.id,
                          variantId: item.variantId,
                          quantity: quantity - 1,
                        })
                      }
                    >
                      −
                    </button>
                    <label
                      className="sr-only"
                      htmlFor={`quantity-${lineKey}`}
                    >
                      {label} quantity
                    </label>
                    <input
                      id={`quantity-${lineKey}`}
                      type="number"
                      disabled={busy}
                      min={1}
                      max={MAX_QUANTITY}
                      step={1}
                      value={quantity}
                      onChange={(event) =>
                        dispatch({
                          type: "quantity",
                          productId: product.id,
                          variantId: item.variantId,
                          quantity: event.target.valueAsNumber,
                        })
                      }
                    />
                    <button
                      aria-label={`Increase ${label} quantity`}
                      disabled={busy || quantity === MAX_QUANTITY}
                      onClick={() =>
                        dispatch({
                          type: "quantity",
                          productId: product.id,
                          variantId: item.variantId,
                          quantity: quantity + 1,
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="remove-button"
                    aria-disabled={busy}
                    aria-label={`Remove ${label}`}
                    data-cart-remove=""
                    onBlur={() => { cancelledFocus.current = noticeSeq.current; }}
                    onClick={(event) => { if (busy) return; void removeLine(product, item.variantId, variant && variantLabel(variant) ? variantLabel(variant) : "", event.detail === 0 ? event.currentTarget : null, index); }}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <strong className="line-price">{formatMoney(lineTotal)}</strong>
            </article>
          );})}
        </div>
        <aside className="summary">
          <h2>Order summary</h2>
          {lines.length > 0 ? (
            <>
              <OrderSummary subtotal={subtotal} />
              {unavailable.length === 0 ? (
                <Link to="/checkout" className="button w-full">
                  Continue to checkout <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <p>Remove unavailable items to continue.</p>
              )}
            </>
          ) : (
            <p>
              No available items to total. Remove unavailable items and continue
              shopping.
            </p>
          )}
          <p className="small-note">
            Order totals are confirmed securely at checkout. Payment awaits confirmation.
          </p>
        </aside>
      </div>
      <p className="sr-only" role="status">
        Cart subtotal {formatMoney(subtotal)}.
      </p>
    </section>
  );
}
