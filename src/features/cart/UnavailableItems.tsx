import { useCart } from "./CartContext";
import type { CartItem } from "./cart";

export function UnavailableItems({ items }: { items: CartItem[] }) {
  const { dispatch, status } = useCart();
  return (
    <div className="checkout-notice" role="status">
      <strong>Some items are no longer available.</strong>
      <p>
        Remove them before continuing. Unavailable items are excluded from the
        estimate.
      </p>
      <ul>
        {items.map((item, index) => (
          <li
            key={item.productId}
            className="flex items-center justify-between gap-4"
          >
            <span>
              Unavailable item {index + 1} · Qty {item.quantity}
            </span>
            <button
              className="remove-button"
              disabled={status === "saving" || status === "loading" || status === "error" || status === "checking-out"}
              aria-label={`Remove unavailable item ${index + 1}`}
              onClick={() =>
                dispatch({ type: "remove", productId: item.productId })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
