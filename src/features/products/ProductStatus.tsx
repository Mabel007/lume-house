import { useEffect, useRef } from "react";
import { useProducts } from "./ProductContext";
import { UiStatus } from '../../components/UiStatus';

export function ProductStatus({ onRecover }: { onRecover?: () => void } = {}) {
  const { state, refresh } = useProducts();
  // The error control disappears while the retry is in flight, so focus would
  // otherwise fall to <body> when the collection returns. The parent supplies
  // the heading to focus once the retry has genuinely succeeded.
  const retryPending = useRef(false);
  const retryReloaded = useRef(false);
  useEffect(() => {
    if (!retryPending.current) return;
    if (state.status === "loading") {
      // ProductProvider keeps the previous "error" state for the render that
      // starts the reload, so only a reload that actually ran may clear the
      // pending intent before it resolves.
      retryReloaded.current = true;
    } else if (state.status === "ready") {
      retryPending.current = false;
      retryReloaded.current = false;
      onRecover?.();
    } else if (retryReloaded.current) {
      // A retry that failed again must not steal focus on a later success.
      retryPending.current = false;
      retryReloaded.current = false;
    }
  }, [state.status, onRecover]);
  function retry() {
    retryPending.current = true;
    retryReloaded.current = false;
    refresh();
  }
  if (state.status === "loading")
    return (
      <UiStatus kind="loading">
        Loading the collection…
      </UiStatus>
    );
  if (state.status === "error")
    return (
      <UiStatus kind="error">
        <h2>The collection is unavailable.</h2>
        <p>
          We couldn’t load the products. Please try again shortly.
        </p>
        <button className="button" onClick={retry}>
          Try again
        </button>
      </UiStatus>
    );
  if (!state.products.length)
    return (
      <UiStatus kind="empty">
        <h2>A new collection is on its way.</h2>
        <p>There are no available products right now.</p>
        <button className="button" onClick={refresh}>
          Refresh collection
        </button>
      </UiStatus>
    );
  return null;
}
