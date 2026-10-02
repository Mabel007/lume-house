import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { shop } from "../config/shop";
import { useCart } from "../features/cart/CartContext";
import { BagIcon } from "./Icon";

export function Layout() {
  const { items } = useCart();
  const count = items.reduce((total, item) => total + item.quantity, 0);
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = `${pathname === "/" ? "Shop" : pathname === "/cart" ? "Your cart" : pathname === "/checkout" ? "Checkout preview" : "Page not found"} | ${shop.name}`;
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="announcement">
        {shop.tagline} <span>FREETOWN / SIERRA LEONE</span>
      </div>
      <header className="site-header wrap">
        <Link to="/" className="brand" aria-label={`${shop.name} home`}>
          {shop.name}
          <span className="brand-dot" aria-hidden="true">✳</span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex items-center gap-5 sm:gap-9"
        >
          <NavLink to="/" end>
            Shop
          </NavLink>
          <NavLink to="/cart" className="cart-link">
            <BagIcon />
            <span>Cart</span>
            <span className="cart-count">
              {count}
              <span className="sr-only"> items</span>
            </span>
          </NavLink>
        </nav>
      </header>
      <main id="main" ref={main} tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="wrap site-footer">
        <div>
          <Link className="brand" to="/">
            {shop.name}
            <span className="brand-dot">✳</span>
          </Link>
          <p>{shop.tagline}</p>
        </div>
        <p>
          {shop.location}
          <br />
          {shop.phone}<br />{shop.email}
        </p>
      </footer>
    </>
  );
}
