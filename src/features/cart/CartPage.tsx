import { Link } from "react-router-dom";
import { useCart } from "./CartContext";
import { getCartLines, MAX_QUANTITY } from "./cart";
import { useProducts } from "../products/ProductContext";
import { ProductStatus } from "../products/ProductStatus";
import { UnavailableItems } from "./UnavailableItems";
import { formatMoney } from "../../config/shop";
import { EmptyCart } from "../../components/EmptyCart";
import { OrderSummary } from "../checkout/OrderSummary";

export function CartPage() {
  const { items, dispatch } = useCart();
  const { state, refresh } = useProducts();
  if (!items.length) return <EmptyCart />;
  if (state.status !== "ready")
    return (
      <section className="wrap page-section">
        <h1>Your cart.</h1>
        <ProductStatus />
      </section>
    );
  const products = state.products;
  const lines = getCartLines(items, products);
  const unavailable = items.filter(
    (item) => !products.some((product) => product.id === item.productId),
  );
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return (
    <section className="wrap page-section">
      <Link to="/" className="back-link">
        ← Continue shopping
      </Link>
      <p className="eyebrow">YOUR EVERYDAY FINDS</p>
      <h1>Your cart.</h1>
      <p className="muted mb-8">
        Your cart is temporary. Refreshing the page clears your items.
      </p>
      <div className="checkout-grid">
        <div>
          {unavailable.length > 0 && <UnavailableItems items={unavailable} />}
          {lines.map(({ product, quantity, lineTotal }) => (
            <article className="cart-row" key={product.id}>
              <img
                src={product.image}
                alt={`Illustration of ${product.name}`}
                style={{ backgroundColor: product.color }}
              />
              <div className="cart-row-detail">
                <p className="product-category">{product.category}</p>
                <h2>{product.name}</h2>
                <p>{formatMoney(product.price)} each</p>
                <div className="quantity-actions">
                  <div className="quantity-control">
                    <button
                      aria-label={`Decrease ${product.name} quantity`}
                      disabled={quantity === 1}
                      onClick={() =>
                        dispatch({
                          type: "quantity",
                          productId: product.id,
                          quantity: quantity - 1,
                        })
                      }
                    >
                      −
                    </button>
                    <label
                      className="sr-only"
                      htmlFor={`quantity-${product.id}`}
                    >
                      {product.name} quantity
                    </label>
                    <input
                      id={`quantity-${product.id}`}
                      type="number"
                      min={1}
                      max={MAX_QUANTITY}
                      step={1}
                      value={quantity}
                      onChange={(event) =>
                        dispatch({
                          type: "quantity",
                          productId: product.id,
                          quantity: event.target.valueAsNumber,
                        })
                      }
                    />
                    <button
                      aria-label={`Increase ${product.name} quantity`}
                      disabled={quantity === MAX_QUANTITY}
                      onClick={() =>
                        dispatch({
                          type: "quantity",
                          productId: product.id,
                          quantity: quantity + 1,
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="remove-button"
                    aria-label={`Remove ${product.name}`}
                    onClick={() =>
                      dispatch({ type: "remove", productId: product.id })
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
              <strong className="line-price">{formatMoney(lineTotal)}</strong>
            </article>
          ))}
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
            Preview only. Orders and payments are not available.
          </p>
        </aside>
      </div>
      <p className="sr-only" role="status">
        Cart subtotal {formatMoney(subtotal)}.
      </p>
    </section>
  );
}
