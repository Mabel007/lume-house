import { useProducts } from "../features/products/ProductContext";
import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { shop } from "../config/shop";
import { useCart } from "../features/cart/CartContext";
import { BagIcon } from "./Icon";
import { aboutFragmentTarget, productPathId, routeTitle } from "../config/routeExperience";
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
  // Top-level navigation states are derived from the real location so the
  // active indicator follows navigation immediately and never depends on
  // substring route matching.
  //
  // Matching mirrors the real React Router route table (case-insensitive
  // paths, trailing slash tolerated), so valid URLs such as '/ABOUT' and
  // '/about/' keep their active state. Normalisation keeps comparisons on
  // whole segments, so look-alike prefixes ('/productsx', '/account-team',
  // '/help-center', '/cartography') still never match.
  const current = (pathname.replace(/\/+$/, "") || "/").toLowerCase();
  const shopActive = current === "/" || current.startsWith("/products/");
  const aboutActive = current === "/about";
  const helpActive = current === "/help" || current.startsWith("/help/");
  const accountSection = current === "/account" || current.startsWith("/account/");
  const cartActive = current === "/cart";
  // aria-current semantics: a link whose destination IS the current page
  // (and each section link on its own exact route) exposes aria-current=
  // "page"; a link that only represents the enclosing section of the current
  // page — Shop for product routes, Help for /help/*, Account for /account/*
  // — exposes aria-current="location". The persistent active underline is
  // identical for both, while assistive technology can tell "the current
  // page" apart from "the section of the page the visitor is within".
  const administration = isAdminRoute(pathname);
  const auth = useAuth();
  const signedIn = !auth.loading && Boolean(auth.session);
  const initials = signedIn ? accountInitials(accountDisplayName(auth.session?.user)) : "";
  const { signingOut: accountSigningOut, error: accountSignOutError, signOut: accountSignOut } = useCustomerSignOut();
  const { state: catalog } = useProducts();
  const productId = productPathId(pathname);
  const productName = catalog.status === "ready" && productId !== null
    ? catalog.products.find(product => product.id === productId)?.name
    : undefined;
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef<string | null>(null);
  // Initial loads leave document focus alone so the skip link remains the
  // first forward tab stop. Only later SPA pathname changes move focus to
  // <main>; hash/fragment scrolling is unaffected on any render.
  const firstRender = useRef(true);
  useEffect(() => {
    document.title = `${routeTitle(pathname, productName)} | ${shop.name}`;
    const pathChanged = previousPath.current !== pathname;
    previousPath.current = pathname;
    const initialRender = firstRender.current;
    firstRender.current = false;
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
      if (!initialRender) main.current?.focus({ preventScroll: true });
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
          <Link
            to="/"
            className={shopActive ? "active" : undefined}
            aria-current={shopActive ? (current === "/" ? "page" : "location") : undefined}
          >
            Shop
          </Link>
          <Link to="/about" className={aboutActive ? "active" : undefined} aria-current={aboutActive ? "page" : undefined}>About</Link>
          <Link to="/help" className={helpActive ? "active" : undefined} aria-current={helpActive ? (current === "/help" ? "page" : "location") : undefined}>Help</Link>
          {signedIn ? (
            <AccountMenu initials={initials} signingOut={accountSigningOut} error={accountSignOutError} active={accountSection} onSignOut={() => void accountSignOut()} />
          ) : (
            <Link to="/account" className={accountSection ? "active" : undefined} aria-current={accountSection ? (current === "/account" ? "page" : "location") : undefined}>Account</Link>
          )}
          <Link
            to="/cart"
            className={`cart-link${cartActive ? " active" : ""}`}
            aria-label={`Cart (${count})`}
            aria-current={cartActive ? "page" : undefined}
          >
            <BagIcon />
            <span>Cart</span>
            <span aria-hidden="true">(</span>
            <span key={count} className="cart-count">
              {count}
            </span>
            <span aria-hidden="true">)</span>
          </Link>
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
