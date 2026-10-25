import assert from 'node:assert/strict';
import { test, before, after, afterEach } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';

// Isolated header navigation-state evidence. Supabase is replaced at the
// module boundary; the synthetic session below is a fixture, not live auth.
// No credential, endpoint or hosted call is used.
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver', 'FormData', 'sessionStorage', 'localStorage', 'location']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
dom.window.scrollTo = () => { };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (cb => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || clearTimeout;
const ElementProto = globalThis.Element?.prototype;
if (ElementProto && !ElementProto.scrollIntoView) ElementProto.scrollIntoView = () => { };
const { createRoot } = await import('react-dom/client');

let server, root, container;
const host = dom.window.document.getElementById('root');
let Layout, ProductContext, CartContext, AuthContext, NotificationProvider, CurrencyProvider;

// Navigation probe so tests can drive client-side navigation without
// remounting the router tree.
const controller = { navigate: null };
function NavProbe() {
  controller.navigate = useNavigate();
  return null;
}

before(async () => {
  server = await createServer({
    configFile: false,
    envDir: false,
    server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: 'nav-states-fixture-client',
      enforce: 'pre',
      load(id) {
        if (id.replaceAll('\\', '/').endsWith('/src/lib/supabase/client.ts')) {
          return 'export function getSupabaseClient(){return globalThis.__navStatesClient;}';
        }
      },
    }],
  });
  ({ Layout } = await server.ssrLoadModule('/src/components/Layout.tsx'));
  ({ ProductContext } = await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({ CartContext } = await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({ AuthContext } = await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({ NotificationProvider } = await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
  ({ CurrencyProvider } = await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
});

const teardown = async () => {
  if (root) { await act(async () => { root.unmount(); }); root = undefined; }
  if (container) { host.removeChild(container); container = null; }
  host.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
  delete globalThis.__navStatesClient;
};
afterEach(teardown);
after(async () => { await server.close(); dom.window.close(); });

const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };

const session = { access_token: 'synthetic-jwt', user: { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid' } };

async function mountLayout(initialPath, { authSession = null } = {}) {
  globalThis.__navStatesClient = { functions: { invoke: async () => ({ data: null, error: null }) } };
  container = dom.window.document.createElement('div');
  host.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(MemoryRouter, { initialEntries: [initialPath] },
        React.createElement(NavProbe, null),
        React.createElement(AuthContext.Provider, {
          value: { session: authSession, loading: false, error: null, signIn: async () => { }, signOut: async () => { } },
        },
          React.createElement(ProductContext.Provider, { value: { state: { status: 'ready', products: [] }, refresh() { } } },
            React.createElement(CartContext.Provider, {
              value: { items: [], status: 'ready', error: null, dispatch() { }, retry() { }, recovery: null, refreshSavedCart() { } },
            },
              React.createElement(CurrencyProvider, null,
                React.createElement(NotificationProvider, null,
                  React.createElement(Routes, null, React.createElement(Route, { path: '*', element: React.createElement(Layout) })))))))));
  });
  await flush();
}

const headerNav = () => host.querySelector('nav[aria-label="Main navigation"]');
const activeLinks = () => [...(headerNav()?.querySelectorAll('a.active') ?? [])];

test('exactly one top navigation item is active with aria-current on every storefront surface', async () => {
  const matrix = [
    ['/', 'Shop', 'page'], // the exact route — the link IS the current page
    ['/products/test-product', 'Shop', 'location'], // Shop is the enclosing section
    ['/help', 'Help', 'page'],
    ['/help/delivery-pickup', 'Help', 'location'],
    ['/about', 'About', 'page'],
    ['/account', 'Account', 'page'],
    ['/account/orders', 'Account', 'location'],
    ['/account/orders/11111111-1111-4111-8111-111111111111', 'Account', 'location'],
    ['/cart', 'Cart', 'page'],
  ];
  for (const [path, label, expectation] of matrix) {
    await mountLayout(path);
    const nav = headerNav();
    assert.ok(nav, `${path}: header navigation renders`);
    const active = nav.querySelectorAll('a.active');
    assert.equal(active.length, 1, `${path}: exactly one active navigation item`);
    assert.match(active[0].textContent, new RegExp(`^\\s*${label}(\\(|$)`), `${path}: ${label} is the active item`);
    assert.equal(active[0].getAttribute('aria-current'), expectation, `${path}: active item exposes aria-current="${expectation}"`);
    assert.equal(nav.querySelectorAll('[aria-current]').length, 1, `${path}: a single aria-current in the header`);
    assert.equal(nav.querySelectorAll('[aria-current="page"]').length, expectation === 'page' ? 1 : 0, `${path}: page semantics reserved for exact routes`);
    const cartLink = nav.querySelector('a.cart-link');
    assert.ok(cartLink, `${path}: cart link keeps its accessible label`);
    assert.equal(cartLink.getAttribute('aria-label'), 'Cart (0)');
    await teardown();
  }
});

test('uppercase and trailing-slash URLs match the router table exactly; look-alike variants never activate', async () => {
  const validVariants = [
    ['/about/', 'About', 'page'],
    ['/ABOUT', 'About', 'page'],
    ['/About/', 'About', 'page'],
    ['/cart/', 'Cart', 'page'],
    ['/CART', 'Cart', 'page'],
    ['/products/Test-Product/', 'Shop', 'location'],
    ['/PRODUCTS/mug', 'Shop', 'location'],
    ['/HELP', 'Help', 'page'],
    ['/help/delivery-pickup/', 'Help', 'location'],
    ['/HELP/Delivery-Pickup', 'Help', 'location'],
    ['/account/', 'Account', 'page'],
    ['/ACCOUNT/Orders', 'Account', 'location'],
  ];
  for (const [path, label, expectation] of validVariants) {
    await mountLayout(path);
    const nav = headerNav();
    const active = nav.querySelectorAll('a.active');
    assert.equal(active.length, 1, `${path}: exactly one active navigation item`);
    assert.match(active[0].textContent, new RegExp(`^\\s*${label}(\\(|$)`), `${path}: ${label} activates on a case/trailing-slash variant`);
    assert.equal(active[0].getAttribute('aria-current'), expectation, `${path}: aria-current="${expectation}" on a variant URL`);
    await teardown();
  }
  const lookAlikes = [
    '/about/extra', '/ABOUT-TEAM/', '/productsx', '/PRODUCTSX/', '/accounts', '/ACCOUNTS/',
    '/CARTOGRAPHY', '/help-center/', '/HELP-CENTER', '/account-team', '/accountsx/',
  ];
  for (const path of lookAlikes) {
    await mountLayout(path);
    const nav = headerNav();
    assert.equal(nav.querySelectorAll('a.active').length, 0, `${path}: no active item for a look-alike path`);
    assert.equal(nav.querySelectorAll('[aria-current]').length, 0, `${path}: no aria-current for a look-alike path`);
    await teardown();
  }
});

test('inexact path prefixes never activate a top navigation item, including checkout and order-success surfaces', async () => {
  for (const path of [
    '/product/test-product', '/products', '/productsx', '/about-team', '/help-center',
    '/accounts', '/cartography', '/orders/11111111-1111-4111-8111-111111111111/success', '/unknown',
  ]) {
    await mountLayout(path);
    const nav = headerNav();
    assert.ok(nav, `${path}: header navigation renders`);
    assert.equal(nav.querySelectorAll('a.active').length, 0, `${path}: no top-level item is active`);
    assert.equal(nav.querySelectorAll('[aria-current]').length, 0, `${path}: no aria-current of any kind in the header`);
    await teardown();
  }
});

test('signed-in account surfaces keep one navigation state with the disclosure trigger instead of a second active route', async () => {
  for (const path of ['/account', '/account/orders', '/account/orders/11111111-1111-4111-8111-111111111111']) {
    await mountLayout(path, { authSession: session });
    const nav = headerNav();
    assert.ok(nav, `${path}: header navigation renders`);
    assert.equal(nav.querySelectorAll('a.active').length, 0, `${path}: the account disclosure trigger owns the account affordance, no second active route`);
    for (const anchor of nav.querySelectorAll('a')) assert.notEqual(anchor.textContent.trim(), 'Account', `${path}: the guest Account link is replaced by the disclosure trigger`);
    const trigger = nav.querySelector('button[aria-haspopup="menu"]');
    assert.ok(trigger, `${path}: account disclosure trigger present`);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    // REV-05: the trigger carries the persistent current-section indicator.
    assert.match(trigger.className, /^(header-account active)$/, `${path}: the trigger shows the persistent current-section indicator`);
    assert.equal(trigger.getAttribute('aria-current'), 'location', `${path}: the trigger marks the enclosing account section, not a page`);
    assert.equal(nav.querySelectorAll('[aria-current]').length, 1, `${path}: exactly one nav aria-current, on the trigger`);
    await teardown();
  }
});

test('signed-in and signed-out account state agree across case and trailing-slash URL variants', async () => {
  const variants = [
    ['/account/', 'page'], ['/ACCOUNT', 'page'], ['/ACCOUNT/', 'page'], // exact page destination
    ['/account/orders', 'location'], ['/ACCOUNT/ORDERS', 'location'], ['/account/orders/', 'location'], // enclosing section
  ];
  for (const [path, expectation] of variants) {
    await mountLayout(path, { authSession: session });
    const trigger = headerNav()?.querySelector('button[aria-haspopup="menu"]');
    assert.ok(trigger, `${path}: signed-in trigger renders`);
    assert.match(trigger.className, /header-account active/, `${path}: signed-in trigger keeps the current-section indicator on a variant URL`);
    assert.equal(trigger.getAttribute('aria-current'), 'location');
    await teardown();
    // Signed out, the plain guest link owns the same section state on the
    // same variant URLs, with no menu trigger anywhere.
    await mountLayout(path);
    const guest = headerNav()?.querySelector('a[href="/account"]');
    assert.ok(guest, `${path}: guest Account link renders`);
    assert.match(guest.className, /(^|\s)active(\s|$)/, `${path}: guest link is the active item on a variant URL`);
    assert.equal(guest.getAttribute('aria-current'), expectation, `${path}: guest link semantics follow the route, not the URL spelling`);
    assert.equal(headerNav()?.querySelector('button[aria-haspopup="menu"]'), null, `${path}: guest state shows no menu trigger`);
    assert.equal(headerNav()?.querySelectorAll('[aria-current]').length, 1);
    await teardown();
  }
});

test('client-side navigation moves the active state immediately and never remounts the header', async () => {
  await mountLayout('/about');
  const header = host.querySelector('header.site-header');
  const aboutLink = activeLinks()[0];
  assert.equal(aboutLink?.textContent.trim(), 'About');
  await act(async () => { controller.navigate('/cart'); });
  assert.equal(host.querySelector('header.site-header'), header, 'header node persists across client-side navigation (no remount)');
  const cartLink = activeLinks()[0];
  assert.match(cartLink.textContent, /^Cart/, 'cart item activates immediately');
  assert.equal(aboutLink.classList.contains('active'), false, 'previous item deactivates in the same DOM node');
  assert.equal(aboutLink.getAttribute('aria-current'), null, 'previous item loses aria-current');
  await act(async () => { controller.navigate('/about'); });
  assert.equal(host.querySelector('header.site-header'), header);
  assert.equal(activeLinks()[0], aboutLink, 'returning re-activates the original node without remounting');
  assert.equal(aboutLink.getAttribute('aria-current'), 'page');
  assert.equal(cartLink.classList.contains('active'), false);
  assert.equal(cartLink.getAttribute('aria-current'), null);
});

test('navigation state styling contract: persistent strong active underline, lighter hover/focus bar, global focus-visible outline and responsive header stay intact', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  assert.match(css, /\.site-header nav a\.active::after \{ transform: scaleX\(1\); height: 2px; bottom: 2px; \}/);
  assert.match(css, /\.site-header nav a:not\(\.active\):hover::after,?\s*\n\s*\.site-header nav a:not\(\.active\):focus-visible::after \{ transform: scaleX\(1\); opacity: \.45; \}/);
  assert.match(css, /\.site-header nav a::after \{ content: ""; position: absolute; left: 0; bottom: 3px; width: 100%; height: 1px; background: currentColor; transform: scaleX\(0\); transform-origin: left; transition: transform var\(--motion-time\) var\(--motion-ease\); \}/);
  assert.doesNotMatch(css, /\.site-header nav a:hover::after/);
  assert.doesNotMatch(css, /\.site-header nav a:focus-visible::after/);
  assert.match(css, /:focus-visible \{[^}]*outline: 3px solid #9a542e;[^}]*outline-offset: 4px;[^}]*\}/);
  assert.match(css, /\.site-header \{ flex-wrap: wrap; height: auto; padding-top: 20px; padding-bottom: 20px; gap: 16px; \}/);
  assert.match(css, /\.site-header nav \{ width: 100%; justify-content: space-between; \}/);
  // REV-05: the signed-in trigger's current-section marker shares the active
  // link's 2px bar geometry; the non-active trigger stays underline-free and
  // the badge itself keeps its tint affordance.
  assert.match(css, /\.site-header \.main-nav \.header-account \{ border-radius: 50%; position: relative; \}/);
  assert.match(css, /\.site-header \.main-nav \.header-account\.active::after \{ display: block; content: ""; position: absolute; left: 0; bottom: 2px; width: 100%; height: 2px; background: currentColor; transform-origin: left; \}/);
  assert.match(css, /\.site-header \.main-nav \.header-account::after \{ display: none; \}/);
  assert.match(css, /\.site-header \.main-nav \.header-account:hover \.account-badge, \.site-header \.main-nav \.header-account:focus-visible \.account-badge \{ background: #e1e6d6; border-color: #9aa78f; \}/);
});
