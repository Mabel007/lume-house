import { useCart } from "./CartContext";
import { useNotifications } from "../../components/notifications";
import { cartLineKey, type CartItem } from "./cart";

export function UnavailableItems({ items }: { items: CartItem[] }) {
  const { dispatch, status } = useCart();
  const { notify } = useNotifications();
  async function removeUnavailable(item: CartItem, index: number) {
    const outcome = await dispatch({ type: "remove", productId: item.productId, variantId: item.variantId });
    if (outcome.kind === "rejected") {
      notify({
        tone: "error",
        message: `Unavailable item ${index + 1} could not be removed. Check your Bag before trying again.`,
      });
    }
  }
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
            key={cartLineKey(item)}
            className="flex items-center justify-between gap-4"
          >
            <span>
              Unavailable item {index + 1} · Qty {item.quantity}
            </span>
            <button
              className="remove-button"
              disabled={status === "saving" || status === "loading" || status === "error" || status === "checking-out"}
              aria-label={`Remove unavailable item ${index + 1}`}
              onClick={() => {
                void removeUnavailable(item, index);
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
