import { Link } from "react-router-dom";
import { Breadcrumbs } from "./PageHeader";
import { BagIcon } from "./Icon";

export function EmptyCart() {
  return (
    <section className="empty-state">
      <Breadcrumbs title="Cart" ancestors={[{ label: "Home", to: "/" }]} />
      <BagIcon />
      <h1 tabIndex={-1} data-cart-empty-title>Your Cart is taking a slow day.</h1>
      <p>Find a little something for your everyday.</p>
      <Link to="/" className="button">
        Explore the collection <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}
