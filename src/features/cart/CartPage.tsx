import { Link } from "react-router-dom";
import { useCallback, useRef, useState } from "react";
import { useCart } from "./CartContext";
import { getCartLines, cartLineKey, MAX_QUANTITY } from "./cart";
import { bagRemovedText, bagRemoveFailedText } from "./bagFeedback";
import { BagNotice, type BagNoticeMessage } from "../../components/BagNotice";
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
  const auth = useAuth();
  const [notice, setNotice] = useState<BagNoticeMessage | null>(null);
  const noticeSeq = useRef(0);
  const clearNotice = useCallback(() => setNotice(null), []);
  async function removeLine(product: { id: string; name: string }, variantId: string | undefined, variantDetail: string) {
    noticeSeq.current += 1;
    const id = noticeSeq.current;
    const outcome = await dispatch({ type: "remove", productId: product.id, variantId });
    if (outcome.kind === "confirmed") setNotice({ id, tone: "success", text: bagRemovedText(product.name, variantDetail) });
    else if (outcome.kind === "rejected") setNotice({ id, tone: "failure", text: bagRemoveFailedText(product.name) });
  }
  const busy = status === "saving" || status === "loading" || status === "error" || status === "checking-out";
  const { state, refresh } = useProducts();
  if (status === "loading" || status === "error" || status === "checking-out") return <section className="wrap page-section"><PageHeader title="Your Bag." breadcrumb={{label:'Shop',to:'/'}}/><UiStatus kind={status==='error'?'error':'loading'}>Your saved Bag is not ready yet.</UiStatus></section>;
  if (!items.length) return <><EmptyCart /><BagNotice message={notice} onExpire={clearNotice} /></>;
  if (state.status !== "ready")
    return (
      <section className="wrap page-section">
        <h1>Your Bag.</h1>
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
      <Link to="/" className="back-link">
        ← Continue shopping
      </Link>
      <p className="eyebrow">YOUR EVERYDAY FINDS</p>
      <PageHeader title="Your Bag." description="Review your pieces before checkout."/>
      <p className="muted mb-8">
        {auth.session ? items.some(item=>!item.variantId) ? "Available selections are saved to your account. Unavailable guest items are retained in this browser until removed." : "Your Bag is saved to your account." : "Sign in to save your Bag across visits. Guest items are kept only in this browser tab."}
      </p>
      <div className="checkout-grid">
        <div>
          {unavailable.length > 0 && <UnavailableItems items={unavailable} />}
          {lines.map(({ product, variant, item, quantity, lineTotal, lineKey }) => {
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
                    disabled={busy}
                    aria-label={`Remove ${label}`}
                    onClick={() => { void removeLine(product, item.variantId, variant && variantLabel(variant) ? variantLabel(variant) : ""); }}
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
          <button className="text-link" onClick={refresh}>
            Refresh product prices
          </button>
          <p className="small-note">
            Order totals are confirmed securely at checkout. Payment awaits confirmation.
          </p>
        </aside>
      </div>
      <p className="sr-only" role="status">
        Bag subtotal {formatMoney(subtotal)}.
      </p>
      <BagNotice message={notice} onExpire={clearNotice} />
    </section>
  );
}
