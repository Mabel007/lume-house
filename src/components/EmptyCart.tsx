import { Link } from "react-router-dom";
import { BagIcon } from "./Icon";

export function EmptyCart() {
  return (
    <section className="empty-state">
      <BagIcon />
      <h1>Your Cart is taking a slow day.</h1>
      <p>Find a little something for your everyday.</p>
      <Link to="/" className="button">
        Explore the collection <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}
