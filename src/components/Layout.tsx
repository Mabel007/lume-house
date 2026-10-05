import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { shop } from "../config/shop";
import { useCart } from "../features/cart/CartContext";
import { BagIcon } from "./Icon";
import { useAuth } from "../features/auth/AuthContext";
import { aboutFragmentTarget, routeTitle } from "../config/routeExperience";

export function Layout() {
  const { items, status, error, retry } = useCart();
  const auth = useAuth();
  const count = items.reduce((total, item) => total + item.quantity, 0);
  const { pathname, hash, key } = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef<string | null>(null);
  useEffect(() => {
    document.title = `${routeTitle(pathname)} | ${shop.name}`;
    const pathChanged = previousPath.current !== pathname;
    previousPath.current = pathname;
    const targetId = aboutFragmentTarget(pathname, hash);
    if (targetId) {
      // The Outlet is committed; defer until native fragment scrolling has settled.
      const frame = requestAnimationFrame(() => {
        const target = document.getElementById(targetId);
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ behavior: "instant", block: "start" });
      });
      return () => cancelAnimationFrame(frame);
    }
    if (pathChanged) {
      main.current?.focus({ preventScroll: true });
      if (hash) {
        // Preserve native anchors (including the skip link and Help contact).
        document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "instant" });
      } else window.scrollTo(0, 0);
    }
  }, [pathname, hash, key]);
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
          <NavLink to="/account">{auth.loading ? "Account…" : auth.session ? "Account" : "Sign in"}</NavLink>
          <NavLink to="/cart" className="cart-link">
            <BagIcon />
            <span>Cart</span>
            <span key={count} className="cart-count">
              {count}
              <span className="sr-only"> items</span>
            </span>
          </NavLink>
        </nav>
      </header>
      <main id="main" ref={main} tabIndex={-1}>
        {status === "loading" && <p className="wrap" role="status">Loading your cart…</p>}
        {status === "saving" && <p className="wrap" role="status">Saving your cart…</p>}
        {error && <div className="wrap" role="alert">{error} <button onClick={retry}>Retry saved cart</button></div>}
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
