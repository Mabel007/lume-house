import { useProducts } from "../features/products/ProductContext";
import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { shop } from "../config/shop";
import { useCart } from "../features/cart/CartContext";
import { BagIcon } from "./Icon";
import { aboutFragmentTarget, routeTitle } from "../config/routeExperience";
import { SiteFooter } from "./SiteFooter";
import { isAdminRoute } from "../config/adminNavigation";
import { useAuth } from "../features/auth/AuthContext";
import { accountInitials } from "../features/account/accountInitials";
import { accountDisplayName } from "../features/account/accountIdentity";
import { AccountMenu } from "./AccountMenu";
import { useCustomerSignOut } from "../features/auth/useCustomerSignOut";

export function Layout() {
  const { items, status, error, retry, recovery, refreshSavedCart } = useCart();
  const count = items.reduce((total, item) => total + item.quantity, 0);
  const { pathname, hash, key } = useLocation();
  const administration = isAdminRoute(pathname);
  const auth = useAuth();
  const signedIn = !auth.loading && Boolean(auth.session);
  const initials = signedIn ? accountInitials(accountDisplayName(auth.session?.user)) : "";
  const { signingOut: accountSigningOut, error: accountSignOutError, signOut: accountSignOut } = useCustomerSignOut();
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
          {signedIn ? (
            <AccountMenu initials={initials} onSignOut={() => void accountSignOut()} signingOut={accountSigningOut} error={accountSignOutError} />
          ) : (
            <NavLink to="/account">Account</NavLink>
          )}
          <NavLink to="/cart" className="cart-link" aria-label={`Cart (${count})`}>
            <BagIcon />
            <span>Cart</span>
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
        {!administration && status === "loading" && <p className="wrap" role="status">Loading your Cart…</p>}
        {!administration && status === "saving" && <p className="wrap" role="status">Saving your Cart…</p>}
        {!administration && error && <div className="wrap" role="alert">{error} <button onClick={retry}>Retry saved Cart</button></div>}
        {!administration && recovery && (
          <div className="wrap cart-recovery" aria-busy={recovery.status === "refreshing"}>
            {recovery.status === "required" && <p className="cart-recovery-note">{recovery.message}</p>}
            {recovery.status === "refreshing" && <p className="cart-recovery-note">Refreshing your saved Cart…</p>}
            {recovery.status === "completed" && <p className="cart-recovery-note" role="status">Your saved Cart is up to date. Review the items and quantities before continuing.</p>}
            {recovery.status === "failed" && <p className="cart-recovery-note">We couldn&apos;t refresh your saved Cart, so it may still be out of date.</p>}
            <button
              type="button"
              className="cart-recovery-action"
              aria-disabled={recovery.status === "refreshing"}
              onClick={() => refreshSavedCart?.()}
            >
              Refresh saved Cart
            </button>
          </div>
        )}
        <Outlet />
      </main>
      {!administration && <SiteFooter />}
    </>
  );
}
