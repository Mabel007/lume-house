import { useEffect, useRef } from "react";
import { useCart } from "./CartContext";
import { useNotifications } from "../../components/notifications";
import { bagUnavailableRemoveFailedText } from "./bagFeedback";
import { cartLineKey, type CartItem } from "./cart";

export function UnavailableItems({ items }: { items: CartItem[] }) {
  const { dispatch, status } = useCart();
  const { notify } = useNotifications();
  const noticeSeq = useRef(0);
  const alive = useRef(true);
  // The removal waits for the server, so the page can be left before it
  // answers. A result that arrives after the page is gone must not announce
  // itself on the route the customer moved to.
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function removeUnavailable(item: CartItem, index: number) {
    noticeSeq.current += 1;
    const operation = noticeSeq.current;
    const outcome = await dispatch({ type: "remove", productId: item.productId, variantId: item.variantId });
    if (!alive.current || operation !== noticeSeq.current) return;
    if (outcome.kind === "rejected") {
      notify({
        tone: "error",
        message: bagUnavailableRemoveFailedText(index + 1, outcome.failure),
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
