import { useEffect, useRef } from "react";
import { useProducts, type ProductState } from "./ProductContext";
import { UiStatus } from '../../components/UiStatus';

export function ProductStatus({ onRecover }: { onRecover?: () => void } = {}) {
  const { state, refresh } = useProducts();
  // The status controls disappear while a reload is in flight, so focus would
  // otherwise fall to <body>. Recovery is owned by the exact reload the user
  // requested: ProductProvider increments a revision first and only sets
  // "loading" in a later effect, so a ready render alone is not proof of success.
  const retryPending = useRef(false);
  const loadingState = useRef<ProductState | null>(null);
  useEffect(() => {
    if (!retryPending.current) return;
    if (state.status === "loading") {
      if (loadingState.current === null) {
        loadingState.current = state;
      } else if (loadingState.current !== state) {
        // A different reload started before this one settled. Its success is
        // unrelated and must not consume the earlier recovery intent.
        retryPending.current = false;
        loadingState.current = null;
      }
      return;
    }
    if (!loadingState.current) return;
    if (state.status === "ready") {
      retryPending.current = false;
      loadingState.current = null;
      onRecover?.();
    } else if (state.status === "error") {
      retryPending.current = false;
      loadingState.current = null;
    }
  }, [state, onRecover]);
  function retry() {
    retryPending.current = true;
    loadingState.current = null;
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
        {/* This button is removed while the reload is in flight, so it needs the
            same recovery destination the error-state Try again button already
            has: the collection heading once products are genuinely ready. */}
        <button className="button" onClick={retry}>
          Refresh collection
        </button>
      </UiStatus>
    );
  return null;
}
