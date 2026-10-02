import { useProducts } from "./ProductContext";

export function ProductStatus() {
  const { state, refresh } = useProducts();
  if (state.status === "loading")
    return (
      <div className="catalog-status" role="status">
        Loading the collection…
      </div>
    );
  if (state.status === "error")
    return (
      <div className="catalog-status" role="alert">
        <h2>The collection is unavailable.</h2>
        <p>
          We couldn’t load the products. The shop may still be getting
          connected. Please try again shortly.
        </p>
        <button className="button" onClick={refresh}>
          Try again
        </button>
      </div>
    );
  if (!state.products.length)
    return (
      <div className="catalog-status">
        <h2>A new collection is on its way.</h2>
        <p>There are no available products right now.</p>
        <button className="button" onClick={refresh}>
          Refresh collection
        </button>
      </div>
    );
  return null;
}
