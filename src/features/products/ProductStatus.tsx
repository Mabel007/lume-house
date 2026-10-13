import { useProducts } from "./ProductContext";
import { UiStatus } from '../../components/UiStatus';

export function ProductStatus() {
  const { state, refresh } = useProducts();
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
        <button className="button" onClick={refresh}>
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
