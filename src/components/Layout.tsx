import { useProducts } from "../features/products/ProductContext";
import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { shop } from "../config/shop";
import { useCart } from "../features/cart/CartContext";
import { BagIcon } from "./Icon";
import { aboutFragmentTarget, routeTitle } from "../config/routeExperience";
import { SiteFooter } from "./SiteFooter";
import { isAdminRoute } from "../config/adminNavigation";

export function Layout() {
  const { items, status, error, retry } = useCart();
  const count = items.reduce((total, item) => total + item.quantity, 0);
  const { pathname, hash, key } = useLocation();
  const administration = isAdminRoute(pathname);
  const { state: catalog } = useProducts();
  const productName = catalog.status === "ready" ? catalog.products.find(product => pathname === `/products/${encodeURIComponent(product.id)}`)?.name : undefined;
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef<string | null>(null);
  useEffect(() => {
    document.title = `${routeTitle(pathname, productName)} | ${shop.name}`;
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
  }, [pathname, hash, key, productName]);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {!administration && <>
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
          className="main-nav"
        >
          <NavLink to="/" end>
            Shop
          </NavLink>
          <NavLink to="/about">About</NavLink>
          <NavLink to="/help">Help</NavLink>
          <NavLink to="/account">Account</NavLink>
          <NavLink to="/cart" className="cart-link" aria-label={`Bag (${count})`}>
            <BagIcon />
            <span>Bag</span>
            <span aria-hidden="true">(</span>
            <span key={count} className="cart-count">
              {count}
            </span>
            <span aria-hidden="true">)</span>
          </NavLink>
        </nav>
      </header>
      </>}
      <main id="main" ref={main} tabIndex={-1}>
        {!administration && status === "loading" && <p className="wrap" role="status">Loading your Bag…</p>}
        {!administration && status === "saving" && <p className="wrap" role="status">Saving your Bag…</p>}
        {!administration && error && <div className="wrap" role="alert">{error} <button onClick={retry}>Retry saved Bag</button></div>}
        <Outlet />
      </main>
      {!administration && <SiteFooter />}
    </>
  );
}
