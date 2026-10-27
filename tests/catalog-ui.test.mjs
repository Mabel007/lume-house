let CurrencyProvider;
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup as plainMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { createServer } from "vite";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let server;
let ProductContext, CartContext, AuthContext, ShopPage, CartPage, CheckoutPage;
let contentPages, routeTitle, aboutFragmentTarget, productPathId;
let Layout, SiteFooter, AccountExperience, accountInitials, ProductDetails, ProductDetailsPage;
let NotificationProvider;
let PageHeader;

function checkBreadcrumbs(html, ancestors, current) {
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const nav = document.querySelector('nav[aria-label="Breadcrumb"]');
    assert.ok(nav, "breadcrumb landmark exists");
    assert.equal(document.querySelectorAll('nav[aria-label="Breadcrumb"]').length, 1, "exactly one breadcrumb landmark");
    const list = nav.firstElementChild;
    assert.equal(list.tagName, "OL");
    assert.equal(list.children.length, ancestors.length + 1);
    assert.ok([...list.children].every(item => item.tagName === "LI"));
    assert.deepEqual([...nav.querySelectorAll('a')].map(link => [link.textContent, link.getAttribute('href')]), ancestors);
    const active = nav.querySelector('[aria-current="page"]');
    assert.equal(nav.querySelectorAll('[aria-current]').length, 1);
    assert.equal(active.tagName, "SPAN");
    assert.equal(active.textContent, current);
    assert.equal(active.closest('a'), null);
    assert.equal(active.closest('li'), list.lastElementChild);
    assert.equal(active.getAttribute('tabindex'), null);
    assert.ok([...nav.querySelectorAll('a')].every(link => link.tabIndex === 0));
    assert.ok([...nav.querySelectorAll('.breadcrumb-separator')].every(separator => separator.getAttribute('aria-hidden') === 'true'));
    assert.equal(document.querySelectorAll('h1').length, 1);
  } finally { dom.window.close(); }
}

test("Cart breadcrumbs use Home ancestry with a Cart current label and a single heading in every Cart and catalog state", () => {
  const ready = { status: 'ready', products: [fixture] };
  for (const [status, state, cart] of [
    ['loading', ready, items], ['checking-out', ready, items],
    ['error', ready, items], ['error', {status:'error'}, items],
    ['ready', ready, []], ['ready', ready, items], ['saving', ready, items],
    ['ready', {status:'loading'}, items], ['ready', {status:'error'}, items],
  ]) {
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement(ProductContext.Provider, {value:{state, refresh(){}}},
        React.createElement(CartContext.Provider, {value:{items:cart, status, dispatch:async()=>({kind:'confirmed',items:[]})}},
          React.createElement(NotificationProvider, null, React.createElement(CartPage))))));
    checkBreadcrumbs(html, [['Home', '/']], 'Cart');
    assert.doesNotMatch(html, /Continue shopping/);
    if (!cart.length) assert.match(html, /<h1 tabindex="-1" data-cart-empty-title="true">Your Cart is taking a slow day\.<\/h1>/);
  }
});

test("Product Details keeps Home then Shop ancestry and keeps one heading for long names and unavailable states", () => {
  const name = 'Considered hand-finished everyday piece ' + 'UninterruptedProductName'.repeat(12);
  checkBreadcrumbs(renderDetails({...fixture, name}), [['Home', '/'], ['Shop', '/']], name);
  for (const state of [{status:'loading'}, {status:'error'}, {status:'ready',products:[]}]) {
    const route = React.createElement(Route, {path:'/products/:productId',element:React.createElement(ProductDetailsPage)});
    const trail = renderToStaticMarkup(React.createElement(MemoryRouter, {initialEntries:['/products/missing']},
      React.createElement(ProductContext.Provider, {value:{state,refresh(){}}}, React.createElement(Routes, null, route))));
    checkBreadcrumbs(trail, [['Home','/'], ['Shop','/']], state.status === 'ready' ? 'This piece is unavailable.' : 'Product details.');
    assert.doesNotMatch(trail, /Back to the collection/);
  }
});

/** Client-renders an element tree with console.error captured. The static
 * server renderer never validates list keys — verified against react 19.3.0
 * dev and production builds — whereas react-dom/client is where React
 * reports "Encountered two children with the same key". This is therefore
 * the effective guard that breadcrumb sibling keys stay unique. jsdom
 * globals are installed for the render and removed afterwards. */
async function clientRenderCapturingKeyWarnings(children) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  const names = ['window','document','Element','HTMLElement','HTMLInputElement','HTMLSelectElement','MutationObserver','location'];
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  const warnings = [];
  const original = console.error;
  console.error = (...args) => { warnings.push(args.map(String).join(' ')); };
  let root;
  try {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root'));
    await React.act(() => { root.render(children); });
    return warnings;
  } finally {
    if (root) {
      try { await React.act(async () => { root.unmount(); }); } catch { /* teardown is best-effort */ }
    }
    console.error = original;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    for (const name of names) delete globalThis[name];
    dom.window.close();
  }
}

test("Home and Shop sibling crumbs render through react-dom/client without duplicate-key warnings", async () => {
  // The production trails share a destination, so PageHeader alone owns the
  // duplicate-key invariant: the product-details and legacy trails re-use the
  // exact PageHeader calls the pages make, and the static server renderer
  // never validates list keys (see the helper comment above).
  const productTrail = await clientRenderCapturingKeyWarnings(React.createElement(MemoryRouter, null,
    React.createElement(PageHeader, { title: 'A product.', trail: [{ label: 'Home', to: '/' }, { label: 'Shop', to: '/' }] })));
  assert.deepEqual(productTrail, [], 'React must not report duplicate keys for the sibling crumbs sharing the Home/Shop destination');
  const singleAncestor = await clientRenderCapturingKeyWarnings(React.createElement(MemoryRouter, null,
    React.createElement(PageHeader, { title: 'Checkout', breadcrumb: { label: 'Cart', to: '/cart' } })));
  assert.deepEqual(singleAncestor, [], 'React must not report duplicate keys for the checkout ancestry');
});

test("Help and policy breadcrumbs preserve nested ancestors, legal pages stay outside Help, and About gains a Home trail", () => {
  for (const [path, title] of [['/help','Help & Contact'], ['/help/delivery-pickup','Delivery & Pickup'], ['/help/returns-refunds','Returns & Refunds'], ['/privacy','Privacy Policy'], ['/terms','Terms & Conditions']]) {
    const ancestors = [['Home','/']];
    if (path.startsWith('/help/')) ancestors.push(['Help & Contact','/help']);
    checkBreadcrumbs(renderContent(path), ancestors, title);
  }
  checkBreadcrumbs(renderContent('/about'), [['Home','/']], 'About');
  const aboutTrail = renderContent('/about').match(/<nav aria-label="Breadcrumb">[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.doesNotMatch(aboutTrail, /href="\/help/);
});

test("legacy PageHeader breadcrumbs retain their parent link, breadcrumbLabel decouples the current label from the h1, and top-level headers omit breadcrumb navigation", () => {
  const header = props => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(PageHeader, props)));
  checkBreadcrumbs(header({title:'Checkout',breadcrumb:{label:'Cart',to:'/cart'}}), [['Cart','/cart']], 'Checkout');
  const labelled = header({ title: 'Your Cart.', trail: [{ label: 'Home', to: '/' }, { label: 'Shop', to: '/' }], breadcrumbLabel: 'Cart' });
  checkBreadcrumbs(labelled, [['Home','/'], ['Shop','/']], 'Cart');
  assert.match(labelled, /<h1>Your Cart\.<\/h1>/);
  assert.doesNotMatch(header({title:'Shop'}), /aria-label="Breadcrumb"/);
});

test("standardized trails keep every ancestor on a real supported destination, checkout breadcrumb-free with its sign-in back-link, and the catalog landing trail-free", () => {
  assert.doesNotMatch(render(ShopPage, { status: "ready", products: [fixture] }), /aria-label="Breadcrumb"/);
  const checkout = render(CheckoutPage, { status: "ready", products: [fixture] });
  assert.doesNotMatch(checkout, /aria-label="Breadcrumb"/);
  assert.match(checkout, /href="\/account"[^>]*>Sign in to place your order/);
  const allowedAncestors = {
    'Home': '/', 'Shop': '/', 'Help & Contact': '/help',
    'Delivery & Pickup': '/help/delivery-pickup', 'Returns & Refunds': '/help/returns-refunds',
  };
  for (const path of Object.keys(contentPages)) {
    const dom = new JSDOM(renderContent(path));
    try {
      const nav = dom.window.document.querySelector('nav[aria-label="Breadcrumb"]');
      assert.ok(nav, `${path}: breadcrumb landmark`);
      for (const anchor of nav.querySelectorAll('a'))
        assert.equal(allowedAncestors[anchor.textContent] ?? null, anchor.getAttribute('href'),
          `${path}: ancestor "${anchor.textContent}" must link a real supported destination`);
    } finally { dom.window.close(); }
  }
});
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
  ({ CurrencyProvider } = await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
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
  ({ routeTitle, aboutFragmentTarget, productPathId } = await server.ssrLoadModule("/src/config/routeExperience.ts"));
  ({ Layout } = await server.ssrLoadModule("/src/components/Layout.tsx"));
  ({ SiteFooter } = await server.ssrLoadModule("/src/components/SiteFooter.tsx"));
  ({ AccountExperience } = await server.ssrLoadModule("/src/features/account/AccountExperience.tsx"));
  ({ accountInitials } = await server.ssrLoadModule("/src/features/account/accountInitials.ts"));
  ({ PageHeader } = await server.ssrLoadModule("/src/components/PageHeader.tsx"));
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
    assert.equal(
      (html.match(/<nav aria-label="Breadcrumb">/g) ?? []).length,
      1,
      `${path}: exactly one breadcrumb trail`,
    );
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
  assert.match(html, /<nav aria-label="Breadcrumb"><ol class="breadcrumb-list"><li><a[^>]*href="\/"[^>]*>Home<\/a>/);
  assert.match(html, /aria-current="page">About<\/span>/);
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
  assert.match(delivery, /Freetown, Sierra Leone/);
  assert.match(delivery, /choose Sierra Leone as the delivery country/);
  assert.match(renderContent("/help"), /Delivery in selected areas of Freetown, Sierra Leone/);
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

test("route titles follow valid mixed-case and trailing-slash URLs without weakening 404s", () => {
  for (const [path, title] of [
    ["/ABOUT", "About"],
    ["/About/", "About"],
    ["/HELP", "Help & Contact"],
    ["/HELP/Delivery-Pickup/", "Delivery & Pickup"],
    ["/CART", "Your Cart"],
    ["/CHECKOUT/BUY-NOW", "Buy Now checkout"],
    ["/ACCOUNT/ORDERS", "Your account"],
    ["/AUTH/CALLBACK/", "Your account"],
    ["/ORDERS/example/SUCCESS", "Your order"],
  ]) assert.equal(routeTitle(path), title, path);
  for (const path of ["/ABOUT-TEAM", "/HELP-CENTER", "/PRODUCTSX", "/products", "/constructor"])
    assert.equal(routeTitle(path), "Page not found", path);
});

test("product route identity keeps product IDs case-sensitive across route spelling variants", () => {
  assert.equal(productPathId("/products/Test-Product"), "Test-Product");
  assert.equal(productPathId("/products/Test-Product/"), "Test-Product");
  assert.equal(productPathId("/PRODUCTS/Test-Product"), "Test-Product");
  assert.equal(productPathId("/products/encoded%20piece"), "encoded piece");
  assert.equal(productPathId("/products"), null);
  assert.equal(productPathId("/products/Test-Product/gallery"), null);
  assert.equal(productPathId("/productsx/Test-Product"), null);
  assert.equal(routeTitle("/PRODUCTS/Test-Product/", "Test Product Name"), "Test Product Name");
  assert.equal(routeTitle("/PRODUCTS/Test-Product"), "Product details");
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
  assert.match(checkout, /Use my contact number/);
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
    "Delivery country",
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
  assert.match(html, /id="contact-phone-help"[^>]*>Enter an 8-digit Sierra Leone phone number\./);
  assert.match(
    html,
    /id="payment-help"[^>]*>Enter the payer.s 8-digit Sierra Leone mobile-money number\./,
  );
  assert.doesNotMatch(html, /Any Sierra Leone mobile network is accepted/);
  assert.match(html, /Number format help/);
  assert.match(html, /Payment number details/);
  assert.equal((html.match(/help-disclosure-panel/g) ?? []).length, 2);
  assert.match(html, /aria-controls="phone-format-panel"/);
  assert.match(html, /aria-controls="payment-details-panel"/);
  assert.match(html, /id="phone-format-panel"[^>]*hidden=""/);
  assert.match(html, /id="payment-details-panel"[^>]*hidden=""/);
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
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-controls="delivery-country-listbox"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /value="Sierra Leone"/);
  assert.match(html, /id="delivery-country-help"[^>]*>We currently deliver within Freetown, Sierra Leone only\./);
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
function optionRadio(document, value) {
  const option = document.querySelector(`input[type="radio"][value="${value}"]`);
  assert.ok(option, `the ${value} option renders`);
  return option;
}
function purchaseButton(document, name) {
  const button = document.querySelector(`button.${name}`);
  assert.ok(button, `the ${name} action renders`);
  return button;
}

test("primary navigation has five destinations, account/help descendant active states and Cart count", () => {
  const nav = renderLayout("/").match(/<nav aria-label="Main navigation"[^>]*>(.*?)<\/nav>/s)[1];
  assert.equal((nav.match(/<a /g) ?? []).length, 5);
  for (const path of ["/", "/about", "/help", "/account", "/cart"]) assert.ok(nav.includes(`href="${path}"`));
  assert.match(nav, /aria-label="Cart \(2\)"/);
  assert.doesNotMatch(nav, /My Orders|Sign in|Bag/);
  for (const path of ["/help", "/help/delivery-pickup", "/help/returns-refunds"]) {
    const active = renderLayout(path).match(/<a[^>]*aria-current="(page|location)"[^>]*>/g);
    assert.equal(active.length, 1);
    assert.ok(active[0].includes('href="/help"'));
    // The Help link is the current page only on its own exact route; nested
    // pages get the enclosing-section value instead.
    if (path === "/help") assert.match(active[0], /aria-current="page"/);
    else assert.match(active[0], /aria-current="location"/);
  }
  assert.match(renderLayout("/account/orders"), /aria-current="location"[^>]*href="\/account"/);
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
  // On the storefront root the trigger is not the current section: no active
  // class and no aria-current anywhere on it (REV-05 keeps the indicator
  // scoped to /account routes, asserted in the top-nav DOM suite).
  assert.doesNotMatch(trigger, /class="header-account active"|aria-current=/);
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
  assert.match(bag, /delivers to selected areas of Freetown, Sierra Leone/);
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
test("Product Details distinguishes an unselected available option from an all-unavailable set", () => {
  const choices=[
    {id:'blue',productId:'fixture',options:{Color:'Blue'},isDefault:false,price:2000,currency:'NLE',inventoryPolicy:'tracked',available:true},
    {id:'red',productId:'fixture',options:{Color:'Red'},isDefault:false,price:2200,currency:'NLE',inventoryPolicy:'tracked',available:false},
  ];
  const mixed=renderDetails({...fixture,variants:choices});
  assert.match(mixed,/Choose an available combination\./);
  assert.doesNotMatch(mixed,/This piece is currently unavailable\./);
  const mixedDom=new JSDOM(mixed);
  try {
    const document=mixedDom.window.document;
    assert.equal(optionRadio(document,'blue').disabled,false,'an available option stays selectable');
    assert.equal(optionRadio(document,'red').disabled,true,'an unavailable option is disabled individually');
    assert.equal(purchaseButton(document,'product-details-buy').disabled,true,'Buy Now waits for a valid selection');
    assert.equal(purchaseButton(document,'product-details-add').disabled,true,'Add to Cart waits for a valid selection');
  } finally { mixedDom.window.close(); }
  const gone=renderDetails({...fixture,variants:choices.map(choice=>({...choice,available:false}))});
  assert.match(gone,/This piece is currently unavailable\./);
  assert.doesNotMatch(gone,/Choose an available combination\./);
  const goneDom=new JSDOM(gone);
  try {
    const document=goneDom.window.document;
    assert.equal(document.querySelectorAll('input[type="radio"]').length,2,'both configured options render');
    for (const [value,label] of [['blue','Blue'],['red','Red']]) {
      const option=optionRadio(document,value);
      assert.equal(option.disabled,true,`the ${value} option is disabled`);
      const optionLabel=option.closest('label')?.textContent??'';
      assert.ok(optionLabel.includes(label)&&optionLabel.includes('Unavailable'),`the ${value} option is labelled unavailable`);
    }
    assert.equal(purchaseButton(document,'product-details-buy').disabled,true,'Buy Now is disabled when every option is unavailable');
    assert.equal(purchaseButton(document,'product-details-add').disabled,true,'Add to Cart is disabled when every option is unavailable');
  } finally { goneDom.window.close(); }
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
test('unavailable single-option cards explain the state instead of showing a disabled Add to Cart action',()=>{
 const base={id:'fixture',productId:'fixture',options:{},isDefault:true,price:1800,currency:'NLE',inventoryPolicy:'tracked'};
 const unavailableProducts=[
  {...fixture,id:'tracked-unavailable',name:'Tracked unavailable',variants:[{...base,id:'default:tracked-unavailable',productId:'tracked-unavailable',available:false}]},
  {...fixture,id:'missing-default',name:'Missing default',variants:[]},
 ];
 for(const product of unavailableProducts){
  const html=render(ShopPage,{status:'ready',products:[product]},[]);
  const card=html.match(/<article class="product-card"[\s\S]*?<\/article>/)?.[0]??'';
  assert.ok(card,`${product.name}: card renders`);
  assert.match(card,/<button[^>]*class="add-button"[^>]*disabled=""/,`${product.name}: purchase remains guarded`);
  assert.match(card,/>Unavailable</,`${product.name}: explicit unavailable label`);
  assert.doesNotMatch(card,/Add to Cart/,`${product.name}: no disabled purchase wording`);
  assert.doesNotMatch(card,new RegExp(`Add ${product.name} to Cart`),`${product.name}: accessible name states the unavailable state`);
  assert.match(card,/This piece is currently unavailable\./,`${product.name}: accessible explanation`);
  const describedBy=card.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(describedBy,`${product.name}: explanation is associated with the button`);
  assert.ok(card.includes(`id="${describedBy}"`),`${product.name}: described element exists`);
 }
 const available={...fixture,id:'available-tracked',name:'Available tracked',variants:[{...base,id:'default:available-tracked',productId:'available-tracked',available:true}]};
 const html=render(ShopPage,{status:'ready',products:[available]},[]);
 assert.match(html,/aria-label="Add Available tracked to Cart"/);
 assert.doesNotMatch(html,/>Unavailable</);
 assert.doesNotMatch(html,/<button[^>]*class="add-button"[^>]*disabled=""/);
 assert.doesNotMatch(html,/This piece is currently unavailable\./);
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

function renderToStaticMarkup(element) { return plainMarkup(React.createElement(CurrencyProvider, null, element)); }
