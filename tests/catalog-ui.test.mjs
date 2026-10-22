import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { createServer } from "vite";
import { readFileSync } from "node:fs";

let server;
let ProductContext, CartContext, AuthContext, ShopPage, CartPage, CheckoutPage;
let contentPages, routeTitle, aboutFragmentTarget;
let Layout, SiteFooter, AccountExperience, accountInitials, ProductDetails, ProductDetailsPage;
let NotificationProvider;
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  ({ ProductContext } = await server.ssrLoadModule(
    "/src/features/products/ProductContext.ts",
  ));
  ({ CartContext } = await server.ssrLoadModule(
    "/src/features/cart/CartContext.ts",
  ));
  ({ AuthContext } = await server.ssrLoadModule(
    "/src/features/auth/AuthContext.ts",
  ));
  ({ ProductDetails, ProductDetailsPage } = await server.ssrLoadModule("/src/features/products/ProductDetailsPage.tsx"));
  ({ NotificationProvider } = await server.ssrLoadModule("/src/components/NotificationProvider.tsx"));
  ({ ShopPage } = await server.ssrLoadModule(
    "/src/features/products/ShopPage.tsx",
  ));
  ({ CartPage } = await server.ssrLoadModule(
    "/src/features/cart/CartPage.tsx",
  ));
  ({ CheckoutPage } = await server.ssrLoadModule(
    "/src/features/checkout/CheckoutPage.tsx",
  ));
  const { AboutPage } = await server.ssrLoadModule("/src/features/content/AboutPage.tsx");
  const { HelpPage } = await server.ssrLoadModule("/src/features/content/HelpPage.tsx");
  const policies = await server.ssrLoadModule("/src/features/content/PolicyPages.tsx");
  contentPages = {
    "/about": AboutPage, "/help": HelpPage,
    "/help/delivery-pickup": policies.DeliveryPickupPage,
    "/help/returns-refunds": policies.ReturnsRefundsPage,
    "/privacy": policies.PrivacyPage, "/terms": policies.TermsPage,
  };
  ({ routeTitle, aboutFragmentTarget } = await server.ssrLoadModule("/src/config/routeExperience.ts"));
  ({ Layout } = await server.ssrLoadModule("/src/components/Layout.tsx"));
  ({ SiteFooter } = await server.ssrLoadModule("/src/components/SiteFooter.tsx"));
  ({ AccountExperience } = await server.ssrLoadModule("/src/features/account/AccountExperience.tsx"));
  ({ accountInitials } = await server.ssrLoadModule("/src/features/account/accountInitials.ts"));
});

function renderContent(path) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(contentPages[path])));
}

test("all six public content pages render without auth or catalog dependencies and are wired as routes", async () => {
  const { readFileSync } = await import("node:fs");
  const entry = readFileSync("src/main.tsx", "utf8");
  for (const path of Object.keys(contentPages)) {
    const html = renderContent(path);
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, path);
    assert.match(html, /<article/);
    assert.ok(entry.includes(`path="${path}"`), `missing route ${path}`);
    assert.doesNotMatch(html, /<form|Change Password|Forgot Password/);
  }
});

test("About contains approved brand foundation, focusable fragment headings and shopping CTA", () => {
  const html = renderContent("/about");
  assert.match(html, /<h1>A home should feel like yours\.<\/h1>/);
  assert.ok(html.includes("To make beautiful, thoughtfully selected home and lifestyle pieces accessible for creating spaces that feel personal, comfortable and considered."));
  for (const value of ["Thoughtful Design", "Everyday Beauty", "Quality &amp; Care", "Warm Service"]) assert.ok(html.includes(value));
  for (const id of ["our-story", "our-values"]) {
    assert.ok(html.includes(`id="${id}" tabindex="-1"`));
    assert.ok(html.includes(`href="/about#${id}"`));
  }
  assert.match(html, /href="\/"[^>]*>Explore the collection/);
  assert.doesNotMatch(html, /sustainab|artisan|certified|manufactur|founded in/i);
});

test("Help connects existing account/history and policies with honest contact guidance", () => {
  const html = renderContent("/help");
  for (const path of ["/account", "/account/orders", "/help/delivery-pickup", "/help/returns-refunds"]) assert.ok(html.includes(`href="${path}"`));
  assert.match(html, /mailto:contact@najbuilds.com/);
  assert.match(html, /portfolio ecommerce product by/);
  assert.match(html, /href="https:\/\/najbuilds.com"/);
  assert.match(html, /Never send PINs, OTPs, passwords or mobile-money secrets/);
  assert.match(html, /Sending a request does not cancel an order/);
});

test("policies preserve request eligibility, payment boundaries and separately confirmed fulfilment", () => {
  const returns = renderContent("/help/returns-refunds");
  assert.match(returns, /7 calendar days from receipt to request an eligible return/);
  assert.match(returns, /not an automatic refund guarantee/);
  assert.match(returns, /Eligibility is reviewed/);
  assert.match(returns, /does not process or verify those payments, or automate their refunds/);
  assert.doesNotMatch(returns, /refunds? (?:are|is) automatic|automatically refund|guaranteed refund|final.sale|non.returnable/i);
  for (const path of ["/help", "/help/delivery-pickup", "/help/returns-refunds", "/terms"]) {
    assert.match(renderContent(path), /Placing an order does not mean payment has been confirmed/);
  }
  const delivery = renderContent("/help/delivery-pickup");
  assert.match(delivery, /Pickup in Lumley, Freetown is free/);
  assert.match(delivery, /readiness are confirmed separately/);
  assert.doesNotMatch(delivery, /same.day|next.day|ready immediately/i);
  const privacy = renderContent("/privacy");
  for (const service of ["Google", "Supabase", "Vercel", "Resend"]) assert.ok(privacy.includes(service));
  assert.doesNotMatch(privacy, /GDPR|certif|retain.{0,20}\d+|delete your account|Google Analytics/i);
});

test("route title mapping preserves existing titles and assigns all six public titles", () => {
  const expected = { "/about": "About", "/help": "Help & Contact", "/help/delivery-pickup": "Delivery & Pickup", "/help/returns-refunds": "Returns & Refunds", "/privacy": "Privacy Policy", "/terms": "Terms & Conditions", "/": "Shop", "/cart": "Your Cart", "/checkout": "Checkout", "/account/orders": "Your account", "/auth/callback": "Your account", "/orders/example/success": "Your order", "/unknown": "Page not found" };
  for (const [path, title] of Object.entries(expected)) assert.equal(routeTitle(path), title);
  assert.equal(routeTitle("/about/"), "About");
  assert.equal(routeTitle("/constructor"), "Page not found");
});

test("About fragment recognition is scoped, safely decoded and independent of route entry", () => {
  for (const hash of ["#our-story", "#our-values", "#our%2Dvalues"]) assert.ok(aboutFragmentTarget("/about", hash));
  assert.equal(aboutFragmentTarget("/about/", "#our-values"), "our-values");
  for (const hash of ["", "#main", "#unknown", "#%bad"]) assert.equal(aboutFragmentTarget("/about", hash), null);
  assert.equal(aboutFragmentTarget("/help", "#our-values"), null);
});
after(async () => {
  await server?.close();
});

const fixture = {
  id: "test-product",
  name: "Fixture mug",
  description: "Fixture description",
  category: "Fixture category",
  price: 1800,
  image: "/images/mug.svg",
  color: "#e9e3d8",
};
const items = [{ productId: fixture.id, quantity: 2 }];
function render(Page, state, cart = items) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        ProductContext.Provider,
        { value: { state, refresh() {} } },
        React.createElement(
          CartContext.Provider,
          { value: { items: cart, dispatch() {} } },
          React.createElement(NotificationProvider, null, React.createElement(Page)),
        ),
      ),
    ),
  );
}

test("loading and error states do not show stale totals or add-to-cart actions", () => {
  for (const Page of [ShopPage, CartPage, CheckoutPage]) {
    const loading = render(Page, { status: "loading" });
    assert.match(loading, /Loading the collection/);
    assert.doesNotMatch(loading, /\$|Add to Cart|Continue to checkout/);
    const failed = render(Page, { status: "error" });
    assert.match(failed, /The collection is unavailable/);
    assert.match(failed, /Try again/);
    assert.doesNotMatch(failed, /\$|Add to Cart|Continue to checkout/);
  }
});
test("empty catalog does not fall back to demo products", () => {
  const html = render(ShopPage, { status: "ready", products: [] });
  assert.match(html, /There are no available products/);
  assert.doesNotMatch(html, /product-card|Everyday ceramic mug/);
});
test("ready catalog feeds cards, cart prices and guest sign-in checkout", () => {
  const state = { status: "ready", products: [fixture] };
  assert.match(render(ShopPage, state), /Fixture mug/);
  assert.match(render(ShopPage, state), /Fixture category/);
  const cart = render(CartPage, state);
  assert.match(cart, /NLE 36/);
  assert.match(cart, /Choose at checkout/);
  const checkout = render(CheckoutPage, state);
  assert.match(checkout, /href="\/account"[^>]*>Sign in to place your order/);
  assert.match(checkout, /Use my contact phone number/);
  assert.match(
    render(CartPage, {
      status: "ready",
      products: [{ ...fixture, price: 2000 }],
    }),
    /NLE 40/,
  );
});
test("unavailable products can be removed and cannot proceed to checkout", () => {
  const state = { status: "ready", products: [] };
  const cart = render(CartPage, state);
  assert.match(cart, /Remove unavailable item 1/);
  assert.doesNotMatch(cart, /Continue to checkout|\$5\.00/);
  const checkout = render(CheckoutPage, state);
  assert.match(checkout, /Review your Cart/);
  assert.doesNotMatch(checkout, /Place order/);
  assert.match(render(CartPage, state, []), /Your Cart is taking a slow day/);
  assert.match(
    render(CheckoutPage, state, []),
    /Your Cart is taking a slow day/,
  );
});

test("checkout localizes fields and honestly distinguishes delivery and payment", () => {
  const html = render(CheckoutPage, { status: "ready", products: [fixture] });
  for (const label of [
    "Full name",
    "Phone number",
    "Street address / landmark",
    "Area / community",
    "City / town",
    "Delivery instructions",
    "Orange Money",
    "Afrimoney",
    "Mobile-money number",
  ])
    assert.ok(html.includes(label));
  assert.match(html, /Delivery details needed/);
  assert.match(html, /Payment awaits confirmation/);
  assert.match(html, /aria-describedby="payment-help payment-error"/);
  assert.match(html, /aria-describedby="contact-phone-help"/);
  assert.match(html, /id="contact-phone-help"/);
  assert.match(
    html,
    /Enter an 8-digit Sierra Leone phone number, with or without 0 or \+232\. Example: 0XX XXX XXX\./,
  );
  assert.match(
    html,
    /Any Sierra Leone mobile network is accepted\. Use 8 digits/,
  );
  assert.match(html, /Example: 0XX XXX XXX\./);
  assert.equal((html.match(/inputmode="tel"/gi) ?? []).length, 2);
  assert.doesNotMatch(html, /for example \+232|76521208/);
  assert.doesNotMatch(
    html,
    /State \/ region|Postal code|ZIP|Demo delivery|payment successful|order confirmed/i,
  );
  assert.doesNotMatch(html, /chrisbarbz17|Naj Flex|Sheriff Drive/);
  assert.match(html, /name="delivery-zone" required/);
  assert.match(html, /list="delivery-city-options"/);
  assert.match(html, /<datalist id="delivery-city-options">/);
  assert.match(html, /aria-describedby="delivery-city-help"/);
  assert.match(html, /id="delivery-city-help">We currently deliver within Freetown only\./);
  assert.match(html, /NLE 40/);
  assert.match(html, /NLE 50/);
  assert.match(html, /NLE 60/);
  assert.doesNotMatch(html, /then 76|then 88|PIN|USSD/);
});

test("expanded catalog has accessible interactions, editorial sections and responsive frame", async () => {
  const { catalog } = await server.ssrLoadModule(
    "/src/features/products/catalog.ts",
  );
  const html = render(ShopPage, { status: "ready", products: catalog }, []);
  assert.equal((html.match(/class="product-card"/g) ?? []).length, 20);
  for (const p of catalog) assert.ok(html.includes(`Add ${p.name} to Cart`));
  assert.match(html, /Shop by collection/);
  assert.match(html, /THE LUMÉ EDIT/);
  assert.match(html, /product-grid/);
  const { readFileSync } = await import("node:fs");
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /:focus-visible/);
});

const guestAuth = { loading: false, session: null, error: null, signIn: async () => {}, signOut: async () => {} };
function renderLayout(path, cartState = { items, status: "ready", error: null, retry() {} }, authState = guestAuth) {
  return renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[path]},
    React.createElement(AuthContext.Provider,{value:authState},
      React.createElement(ProductContext.Provider,{value:{state:{status:"loading"},refresh(){}}},
        React.createElement(CartContext.Provider,{value:cartState},
          React.createElement(Routes,null,React.createElement(Route,{element:React.createElement(Layout)},
            React.createElement(Route,{path:"*",element:React.createElement("h1",null,"Page")}))))))));
}
function renderDetails(product) {
  return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(CartContext.Provider,{value:{items:[],dispatch(){},status:"ready"}},React.createElement(NotificationProvider,null,React.createElement(ProductDetails,{product})))));
}

test("primary navigation has five destinations, account/help descendant active states and Cart count", () => {
  const nav = renderLayout("/").match(/<nav aria-label="Main navigation"[^>]*>(.*?)<\/nav>/s)[1];
  assert.equal((nav.match(/<a /g) ?? []).length, 5);
  for (const path of ["/", "/about", "/help", "/account", "/cart"]) assert.ok(nav.includes(`href="${path}"`));
  assert.match(nav, /aria-label="Cart \(2\)"/);
  assert.doesNotMatch(nav, /My Orders|Sign in|Bag/);
  for (const path of ["/help", "/help/delivery-pickup", "/help/returns-refunds"]) {
    const active = renderLayout(path).match(/<a[^>]*aria-current="page"[^>]*>/g);
    assert.equal(active.length, 1);
    assert.ok(active[0].includes('href="/help"'));
  }
  assert.match(renderLayout("/account/orders"), /aria-current="page"[^>]*href="\/account"/);
});

test("header keeps guest/loading Account text and shows only private initials when signed in", () => {
  const session = { access_token: "synthetic", user: { id: "11111111-1111-4111-8111-111111111111", email: "customer@example.invalid", user_metadata: { full_name: "Naj Builds" } } };
  const signedIn = { ...guestAuth, session };
  assert.match(renderLayout("/"), /href="\/account"[^>]*>Account<\/a>/);
  assert.doesNotMatch(renderLayout("/"), /account-badge|Account, signed in/);
  const loading = renderLayout("/", undefined, { ...signedIn, loading: true });
  assert.match(loading, /href="\/account"[^>]*>Account<\/a>/);
  assert.doesNotMatch(loading, /account-badge|Account, signed in/);
  const signed = renderLayout("/", undefined, signedIn);
  // The signed-in identity is a menu trigger button, not a link, so guests keep the
  // plain Account link and signed-in customers get a haspopup menu of destinations.
  const trigger = signed.match(/<button[^>]*aria-haspopup="menu"[^>]*>.*?<\/button>/s)?.[0] ?? "";
  assert.ok(trigger, "the signed-in header must expose an account menu trigger");
  assert.match(trigger, /aria-label="Account, signed in"/);
  assert.match(trigger, /class="header-account"/);
  assert.match(trigger, /aria-expanded="false"/);
  assert.match(trigger, /<span class="account-badge" aria-hidden="true">NB<\/span>/);
  assert.doesNotMatch(trigger, /customer@example\.invalid|Naj Builds/);
  const nav = signed.match(/<nav aria-label="Main navigation"[^>]*>(.*?)<\/nav>/s)?.[1] ?? "";
  // The initials badge replaces the Account *label* with a menu trigger, so the nav
  // holds one trigger and the four remaining destinations as links.
  assert.equal((nav.match(/<a /g) ?? []).length, 4, "the badge replaces the label, not the destination");
  assert.equal((nav.match(/<button\b/g) ?? []).length, 1, "the signed-in account control is the only button in the nav");
  assert.doesNotMatch(renderLayout("/admin", undefined, signedIn), /site-header|Account, signed in/);
  const signedOut = renderLayout("/", undefined, { ...signedIn, session: null });
  assert.match(signedOut, /href="\/account"[^>]*>Account<\/a>/);
  assert.doesNotMatch(signedOut, /account-badge|Account, signed in|aria-haspopup="menu"/);
  const noName = renderLayout("/", undefined, { ...signedIn, session: { ...session, user: { ...session.user, user_metadata: {} } } });
  assert.match(noName, /class="account-badge" aria-hidden="true">LH</);
});

test("ecommerce footer provides grouped real links, dynamic year and separate developer attribution", () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(SiteFooter)));
  assert.match(html, /<footer/);
  for (const group of ["Shop", "About", "Help", "Legal"]) assert.ok(html.includes(`>${group}</h2>`));
  for (const path of ["/", "/cart", "/about#our-story", "/about#our-values", "/help", "/account/orders", "/help/delivery-pickup", "/help/returns-refunds", "/privacy", "/terms"]) assert.ok(html.includes(`href="${path}"`));
  assert.equal((html.match(/<ul>/g) ?? []).length, 4);
  assert.ok(html.includes(`© ${new Date().getFullYear()} Lumé House. All rights reserved.`));
  assert.match(html, /Built by <a href="https:\/\/najbuilds.com">Naj Builds/);
  assert.match(html, /portfolio ecommerce product by Naj Builds/);
  assert.match(html, /mailto:contact@najbuilds.com/);
  assert.doesNotMatch(html, /hello@lumehouse.sl|\+232|office|social/i);
});

test("Cart copy includes positive shop actions, checkout references and accurate photograph alt", () => {
  const state = { status: "ready", products: [fixture] };
  const shop = render(ShopPage, state, []);
  assert.match(shop, /Add to Cart/);
  assert.match(shop, /aria-label="Add Fixture mug to Cart"/);
  assert.match(shop, /supported Freetown areas/);
  const bag = render(CartPage, state);
  assert.match(bag, /Your Cart/); assert.match(bag, /Cart subtotal/);
  assert.match(bag, /alt="Illustration of Fixture mug"/);
  const photoBag = render(CartPage, { ...state, products: [{ ...fixture, image: "/images/mug.webp" }] });
  assert.match(photoBag, /alt="Fixture mug"/); assert.doesNotMatch(photoBag, /Illustration of/);
  const checkout = render(CheckoutPage, state);
  assert.match(checkout, /Back to Cart/); assert.match(checkout, /Edit your Cart/);
  for (const html of [shop, bag, checkout]) assert.doesNotMatch(html.replace(/<[^>]+>/g, ""), /\bbag\b/i, "the customer-facing copy uses one shopping term");
});
test('storefront search has a labelled native search control and polite results alongside category filtering',()=>{
 const html=render(ShopPage,{status:'ready',products:[fixture]},[]);
 assert.match(html,/<label for="product-search">Search the collection/);
 assert.match(html,/id="product-search"[^>]*type="search"/);
 assert.match(html,/class="collection-results" role="status">1 piece found/);
 assert.match(html,/aria-label="Filter products"/);
 assert.doesNotMatch(html,/No pieces found|Reset search/);
});

test("Add to Cart feedback waits for confirmed persistence before claiming success", async () => {
  assert.match(renderLayout("/", { items: [], status: "loading" }), /Loading your Cart/);
  assert.match(renderLayout("/", { items, status: "saving" }), /Saving your Cart/);
  assert.match(renderLayout("/", { items, status: "error", error: "Your Cart change was not saved.", retry() {} }), /Retry saved Cart/);
  const { readFileSync } = await import("node:fs");
  const shop = readFileSync("src/features/products/ShopPage.tsx", "utf8");
  const details = readFileSync("src/features/products/ProductDetailsPage.tsx", "utf8");
  const feedback = readFileSync("src/features/cart/bagFeedback.ts", "utf8");
  assert.match(details, /await dispatch\(\{type:'add'/);
  assert.match(feedback, /Added \$\{quantity\} × /);
  assert.match(shop, /outcome\.kind==="confirmed"/);
  assert.match(shop, /bagAddedText\(1,name,""\)/);
  assert.doesNotMatch(shop, /Cart update requested/);
  assert.doesNotMatch(readFileSync("src/features/cart/CartProvider.tsx", "utf8"), /Your (?:saved )?bag/i, "the customer-facing copy uses the Cart term");
});

test("Product Details groups add action and Cart link in one stable actions row", async () => {
  const { readFileSync } = await import("node:fs");
  const details = readFileSync("src/features/products/ProductDetailsPage.tsx", "utf8");
  const group = details.match(/<div className="product-details-actions">[\s\S]*?<\/div>/);
  assert.ok(group, "actions group wraps the add button and View Cart link");
  assert.match(group[0], /product-details-add/);
  assert.doesNotMatch(group[0], /role="status"|className="feedback"/, "the migrated inline feedback slot is removed");
  assert.match(group[0], /to="\/cart">View your Cart/);
  assert.ok(group[0].indexOf("product-details-add") < group[0].indexOf('to="/cart"'), "focus order: add button before Cart link");
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /\.product-details-actions \{ display: flex; flex-direction: column;/);
  assert.doesNotMatch(css, /\.product-details-actions \.feedback/, "feedback no longer reserves vertical space in the actions row");
  assert.match(css, /@media \(max-width: 479px\)[^@]*\.product-details-actions \.product-details-add \{ width: 100%;/);
});

test("account initials handle whitespace, single names, missing names and Unicode graphemes", () => {
  for (const [name, expected] of [["Naj Builds", "NB"], [" Naj  ", "N"], ["", "LH"], [null,"LH"], [undefined,"LH"], ["  ---  ", "LH"], ["Élodie 東京", "É東"], ["e\u0301lodie", "É"]]) assert.equal(accountInitials(name), expected);
});

function renderAccount(overrides = {}) {
  const profile = { full_name: "Customer Name", phone: "", default_street_address: "", default_area: "", default_city: "" };
  const signOut = { signingOut: false, error: null, signOut: async () => {} };
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(AccountExperience, { profile, savedName: "Saved Name", email: "customer@example.test", ready: true, busy: false, status: "", error: null, onChange: () => {}, onSave: () => {}, onCancel: () => {}, signOut, ...overrides })));
}

test("Account separates saved identity, grouped defaults, orders and Google security", () => {
  const html = renderAccount();
  assert.match(html, /aria-hidden="true">SN/);
  assert.match(html, /class="account-name">Saved Name/);
  assert.match(html, /<legend[^>]*>Personal Information<\/legend>/);
  assert.match(html, /<legend[^>]*>Delivery Details<\/legend>/);
  assert.match(html, /Signed in with Google/);
  assert.match(html, /does not manage a password for this account/);
  assert.match(html, /href="\/account\/orders"[^>]*>My Orders/);
  assert.match(html, />Sign Out<\/button>/);
  assert.match(html, /Save profile &amp; delivery details/);
  assert.doesNotMatch(html, /Change Password|Forgot Password|Reset Password|type="password"/);
  for (const [name, token] of [["full_name","section-profile name"],["phone","section-profile tel"],["default_street_address","section-delivery address-line1"],["default_area","section-delivery address-level3"],["default_city","section-delivery address-level2"]]) {
    assert.ok(html.includes(`for="${name}"`));
    const input = html.match(new RegExp(`<input[^>]*id="${name}"[^>]*>`))?.[0] ?? "";
    assert.ok(input.includes(`name="${name}"`));
    assert.ok(input.includes(`autoComplete="${token}"`));
  }
});

test("Account-page sign-out shows a pending label, blocks duplicates and stays retryable on failure", () => {
  const pending = renderAccount({ signOut: { signingOut: true, error: null, signOut: async () => {} } });
  assert.match(pending, />Signing out…<\/button>/, "a pending sign-out must be labelled");
  assert.match(pending, /<button class="text-link" type="button" disabled=""/, "a pending sign-out must block duplicate attempts");
  assert.doesNotMatch(pending, />Sign Out<\/button>/, "the idle label must not remain while pending");
  const failed = renderAccount({ signOut: { signingOut: false, error: "Sign-out failed. Please try again.", signOut: async () => {} } });
  assert.match(failed, /role="alert"[^>]*>Sign-out failed\. Please try again\.<\/p>/, "a failed page sign-out must announce a retryable error");
  assert.match(failed, />Sign Out<\/button>/, "a failed sign-out must remain retryable");
  assert.doesNotMatch(failed, /<button class="text-link" type="button" disabled=""/, "a failed sign-out must re-enable the control");
});

test("Account hub links to existing destinations and uses only available current identity", () => {
  const html = renderAccount();
  assert.match(html, /aria-label="Account sections"/);
  for (const destination of ["/account#personal-information", "/account#delivery-details", "/account/orders", "/account#account-security", "/account#account-help", "/help#contact", "/help/delivery-pickup", "/help/returns-refunds"]) assert.ok(html.includes(`href="${destination}"`));
  assert.equal((html.match(/<form\b/g) ?? []).length, 1);
  assert.match(renderAccount({ savedName: "", authenticatedName: "Current Customer" }), /class="account-name">Current Customer/);
  assert.match(renderAccount({ savedName: "", authenticatedName: "Current Customer" }), /aria-hidden="true">CC/);
  assert.match(renderAccount({ authenticatedName: "Google Name" }), /class="account-name">Saved Name/);
  assert.match(html, /id="account-auth-email"[^>]*readOnly=""/);
  assert.match(html, /type="button"[^>]*>Cancel/);
  assert.match(html, /Cancel restores your last loaded or saved details/);
});

test("Account loading/error states keep saving disabled and empty identity has a safe fallback", () => {
  const html = renderAccount({ savedName: " ", ready: false, status: "Your profile could not be loaded. Reload to try again." });
  assert.match(html, /aria-hidden="true">LH/);
  assert.match(html, /class="account-name">Your account/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 7);
  assert.match(html, /role="status">Your profile could not be loaded/);
});

test("Product Details default-only renders a normal purchase without meaningless selectors", () => {
  const product={id:'fixture',name:'Test piece',category:'Test',description:'Existing description',price:1800,image:'/images/mug.svg',color:'#e9e3d8',variants:[{id:'default:fixture',productId:'fixture',options:{},isDefault:true,price:1800,currency:'NLE',inventoryPolicy:'untracked'}]};
  const html=renderDetails(product);
  assert.match(html,/<h1>Test piece<\/h1>/);assert.match(html,/Add Test piece to Cart/);assert.match(html,/Available to add to your Cart/);assert.doesNotMatch(html,/Choose your options|Color: Default|Size: Default|reviews|ratings/i);
  const unavailable=renderDetails({...product,variants:[]});
  assert.match(unavailable,/disabled=""/);assert.match(unavailable,/currently unavailable/);
});

test("Product Details meaningful options require an explicit valid selection", () => {
  const product={id:'fixture',name:'Test piece',category:'Test',description:'Existing description',price:1800,image:'/images/mug.svg',color:'#e9e3d8',variants:[{id:'blue',productId:'fixture',options:{Color:'Blue'},isDefault:false,price:2000,currency:'NLE',inventoryPolicy:'untracked'}]};
  const html=renderDetails(product);
  assert.match(html,/<legend>Choose your options/);assert.match(html,/type="radio"/);assert.match(html,/Color: Blue/);assert.match(html,/NLE 20/);assert.match(html,/disabled=""/);assert.doesNotMatch(html,/checked=""/);
  assert.match(html,/class="product-details-price">From NLE 20/);
  assert.equal(routeTitle('/products/fixture'),'Product details');assert.equal(routeTitle('/products/fixture','Test piece'),'Test piece');
});
test('tracked Product Details refuses unverified or unavailable stock without showing fictional quantities',()=>{
 const variant={id:'default:fixture',productId:'fixture',options:{},isDefault:true,price:1800,currency:'NLE',inventoryPolicy:'tracked'};
 const product={...fixture,id:'fixture',variants:[variant]};
 for(const available of [undefined,false]){
  const html=renderDetails({...product,variants:[{...variant,available}]});
  assert.match(html,/currently unavailable/);assert.match(html,/disabled=""/);assert.doesNotMatch(html,/Only \d+ left/);
 }
 const html=renderDetails({...product,variants:[{...variant,available:true}]});
 assert.match(html,/Available to add to your Cart/);assert.doesNotMatch(html,/<button[^>]*class="button product-details-add"[^>]*disabled/);
});
test('Cart and checkout show separate variant options and variant-derived prices for the same parent',()=>{
 const variants=[{id:'blue',productId:fixture.id,options:{Color:'Blue'},isDefault:false,price:2000,currency:'NLE',inventoryPolicy:'untracked'}, {id:'red',productId:fixture.id,options:{Color:'Red'},isDefault:false,price:2500,currency:'NLE',inventoryPolicy:'untracked'}];
 const state={status:'ready',products:[{...fixture,variants}]};
 const lines=[{productId:fixture.id,variantId:'blue',quantity:2},{productId:fixture.id,variantId:'red',quantity:1}];
 for(const page of [CartPage,CheckoutPage]){
  const html=render(page,state,lines);
  assert.match(html,/Color: Blue/);assert.match(html,/Color: Red/);assert.match(html,/NLE 65/);
 }
 const bag=render(CartPage,state,lines);
 assert.match(bag,/quantity-v:blue/);assert.match(bag,/quantity-v:red/);
});

test("Product Details route handles loading, error and inactive/missing products accessibly", () => {
  for(const state of [{status:'loading'},{status:'error'},{status:'ready',products:[]}]){
    const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:['/products/missing']},React.createElement(ProductContext.Provider,{value:{state,refresh:()=>{}}},React.createElement(Routes,null,React.createElement(Route,{path:'/products/:productId',element:React.createElement(ProductDetailsPage)})))));
    assert.equal((html.match(/<h1[ >]/g)??[]).length,1);
    if(state.status==='ready')assert.match(html,/This piece is unavailable/);else assert.match(html,/role="status"|role="alert"/);
  }
});

test('admin chrome is scoped without changing storefront landmarks or private Cart feedback',()=>{
 for(const path of ['/admin','/admin/orders','/admin/products','/admin/inventory','/admin/memberships','/admin/unknown']){
  const html=renderLayout(path,{items,status:'saving',error:'Synthetic Cart failure',retry(){}});
  assert.match(html,/href="#main"/);assert.match(html,/<main id="main"[^>]*tabindex="-1"/);
  assert.doesNotMatch(html,/Main navigation|<footer|Saving your Cart|Synthetic Cart failure/);
 }
 for(const path of ['/','/cart','/account/orders','/administrator']){
  const html=renderLayout(path,{items,status:'saving',error:'Synthetic Cart failure',retry(){}});
  assert.match(html,/Main navigation/);assert.match(html,/<footer/);assert.match(html,/Saving your Cart/);assert.match(html,/Synthetic Cart failure/);
 }
});

test('temporary Staff Login follows its flag, targets permanent admin, and disables without losing footer links',async()=>{
 const {hngEvaluation}=await server.ssrLoadModule('/src/config/hngEvaluation.ts');
 const footer=props=>renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(SiteFooter,props)));
 assert.equal(footer().includes('Staff Login'),hngEvaluation.showStaffLogin);
 const enabled=footer({showStaffLogin:true});assert.match(enabled,/<a[^>]*href="\/admin"[^>]*>.*?Staff Login<\/a>/);
 assert.match(enabled,/aria-describedby="staff-access-description"/);assert.match(enabled,/<svg[^>]*aria-hidden="true"/);assert.match(enabled,/id="staff-access-description">For authorized store personnel/);
 const disabled=footer({showStaffLogin:false});assert.doesNotMatch(disabled,/Staff Login|href="\/admin"|For authorized store personnel|staff-access-description|footer-staff-access/);
 for(const html of [footer(),disabled]){
  for(const path of ['/','/cart','/about#our-story','/about#our-values','/help','/account/orders','/help/delivery-pickup','/help/returns-refunds','/privacy','/terms'])assert.ok(html.includes(`href="${path}"`));
  assert.equal((html.match(/<ul>/g)??[]).length,4);assert.match(html,/Built by/);
 }
});
test('Staff Login stays absolute on customer nested pages and absent throughout the admin shell',async()=>{
 const {hngEvaluation}=await server.ssrLoadModule('/src/config/hngEvaluation.ts');
 for(const path of ['/','/products/local-test','/cart','/checkout','/account','/account/orders','/account/orders/local-test','/orders/local-test/success','/auth/callback','/about','/help','/help/delivery-pickup','/help/returns-refunds','/privacy','/terms','/not-found']){
  const html=renderLayout(path);const footer=html.match(/<footer[^>]*>(.*?)<\/footer>/s)[1];
  assert.equal(footer.includes('Staff Login'),hngEvaluation.showStaffLogin);
  if(hngEvaluation.showStaffLogin)assert.match(footer,/<a[^>]*href="\/admin"[^>]*>.*?Staff Login<\/a>/);
 }
 for(const path of ['/admin','/admin/orders','/admin/products','/admin/inventory','/admin/memberships','/admin/missing'])assert.doesNotMatch(renderLayout(path),/<footer|Staff Login/);
});
test('responsive role tokens retain user font preferences and aligned admin controls',()=>{
 const css=readFileSync('src/typography.css','utf8');for(const token of ['hero','h1','h2','h3','body','functional','name','meta','eyebrow','footer','tertiary'])assert.ok(css.includes(`--type-${token}:`));assert.match(css,/--type-hero: 2.75rem/);assert.match(css,/--type-hero: 3.75rem/);assert.match(css,/--type-hero: 4.75rem/);assert.match(css,/--type-body: 1.0625rem/);assert.match(css,/min-width: 700px/);assert.match(css,/min-width: 1000px/);assert.doesNotMatch(css,/(?:html|:root)\s*\{[^}]*font-size:/);assert.match(css,/\.footer-staff-access a \{ font-size: var\(--type-functional\)/);assert.match(css,/min-height: 44px/);
 const admin=readFileSync('src/features/admin/admin.css','utf8');assert.match(admin,/\.admin-order-filters \{ display: grid;[^}]*align-items: end/);assert.match(admin,/\.admin-workspace \.admin-order-filters label \{ margin: 0/);
});
