import assert from 'node:assert/strict';
import { test, before, after, afterEach, mock } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from './helpers/vite.mjs';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

// B2.7 currency presentation refinement evidence — revised D1.
// Manual currency selection removed; locale detection drives automatic estimates.
// Header lightened, no footer currency controls, single-provider continuity,
// estimate guidance near totals and the CSS contract.
// Local synthetic modules and a stubbed, counted Frankfurter endpoint only:
// no hosted access, no credentials, no order creation.
//
// The Date clock is frozen for the whole file (the same controlled-clock
// pattern the pure currency suites use). The served Frankfurter reference
// date is derived from that frozen clock, so the suite is deterministic and
// never drifts against the production seven-day staleness window, which
// stays fully enforced against the same frozen "now".

const FROZEN_NOW = '2026-10-23T12:00:00Z';
/** The calendar date the (stubbed) Frankfurter reports, from the test clock. */
const referenceDate = () => new Date().toISOString().slice(0, 10);

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'HTMLInputElement', 'HTMLSelectElement', 'FormData', 'localStorage', 'sessionStorage']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.scrollTo = () => { };
const { createRoot } = await import('react-dom/client');
const { renderToStaticMarkup } = await import('react-dom/server');
const host = dom.window.document.getElementById('root');
const nativeFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

let server, root, container, CurrencyProvider, Layout, OrderSummary, AuthContext, ProductContext, CartContext, NotificationProvider, currency;
let calls = 0;
const CURRENCY_STORAGE_KEY = 'lume:currency';
const rows = () => ['GNF', 'GHS', 'NGN', 'USD'].map((quote, i) => ({ base: 'SLE', date: referenceDate(), quote, rate: [552.74, .73113, 83.54, .06266][i] }));

const serveRates = () => { globalThis.fetch = async () => { calls++; return new Response(JSON.stringify(rows()), { status: 200 }); }; };
const flush = async () => { await act(async () => { await new Promise(resolve => setImmediate(resolve)); }); };
const settle = async () => { for (let i = 0; i < 4; i += 1) await flush(); };

function beginMount() {
  container = dom.window.document.createElement('div');
  host.appendChild(container);
  root = createRoot(container);
}

// Mirrors the shipped main.tsx chain: Auth → Product → Cart → Currency →
// Notification → Layout, anonymous visitor.
async function mountLayout() {
  globalThis.__presentationClient = {
    from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }; },
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
  beginMount();
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ['/'] },
    React.createElement(AuthContext.Provider, { value: { session: null, loading: false, error: null, signIn: async () => { }, signOut: async () => { } } },
      React.createElement(ProductContext.Provider, { value: { state: { status: 'ready', products: [] }, refresh() { } } },
        React.createElement(CartContext.Provider, { value: { items: [], status: 'ready', error: null, dispatch() { }, beginCheckout: () => null, finishCheckout() { }, retry() { }, recovery: null, refreshSavedCart() { } } },
          React.createElement(CurrencyProvider, null,
            React.createElement(NotificationProvider, null,
              React.createElement(Layout, null)))))))));
  await settle();
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined;
  if (container) { host.removeChild(container); container = null; }
  host.replaceChildren();
  localStorage.clear();
  currency.clearRatesCache();
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
  globalThis.fetch = nativeFetch;
  delete globalThis.__presentationClient;
  calls = 0;
});
after(async () => { mock.timers.reset(); await server?.close(); dom.window.close(); });

before(async () => {
  // Controlled test clock (REV-03): everything below — module loads, mounts
  // and every rate validation — sees this instant as "now".
  mock.timers.enable({ apis: ['Date'], now: new Date(FROZEN_NOW) });
  server = await createServer({
    configFile: false,
    envDir: false,
    server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: 'currency-presentation-fixture-client',
      enforce: 'pre',
      load(id) {
        if (id.replaceAll('\\', '/').endsWith('/src/lib/supabase/client.ts')) {
          return 'export function getSupabaseClient(){return globalThis.__presentationClient;}';
        }
      },
    }],
  });
  ({ CurrencyProvider } = await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
  ({ Layout } = await server.ssrLoadModule('/src/components/Layout.tsx'));
  ({ OrderSummary } = await server.ssrLoadModule('/src/features/checkout/OrderSummary.tsx'));
  ({ AuthContext } = await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({ ProductContext } = await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({ CartContext } = await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({ NotificationProvider } = await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
  currency = await server.ssrLoadModule('/src/features/currency/currency.ts');
});

test('source contract: header carries no currency control, locale detection drives estimates, guidance is gated', () => {
  const layout = readFileSync('src/components/Layout.tsx', 'utf8');
  assert.doesNotMatch(layout, /CurrencySelector|CurrencyDisclosure/);
  const footer = readFileSync('src/components/SiteFooter.tsx', 'utf8');
  assert.doesNotMatch(footer, /CurrencySelector|CurrencyDisclosure/);
  assert.doesNotMatch(footer, /footer-currency/);
  const summary = readFileSync('src/features/checkout/OrderSummary.tsx', 'utf8');
  assert.match(summary, /useOptionalCurrency/);
  assert.match(summary, /estimates && currency !== 'NLE'/);
  const css = readFileSync('src/styles.css', 'utf8');
  assert.match(css, /\.currency-estimate \{ display: block;[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.estimate-note \{/);
  const estimate = readFileSync('src/features/currency/CurrencyEstimate.tsx', 'utf8');
  assert.match(estimate, /export function CurrencyEstimate/);
  assert.doesNotMatch(estimate, /CurrencySelector|CurrencyDisclosure/);
});

test('locale detection drives automatic currency selection without manual control', async () => {
  // Sierra Leone locale → NLE (home currency, no estimate shown)
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en-SL'] } });
  serveRates();
  await mountLayout();
  assert.equal(calls, 0, 'NLE home currency never requests rates');
  assert.equal(host.querySelectorAll('.currency-estimate').length, 0, 'no estimate for home currency');
  assert.equal(host.querySelectorAll('select').length, 0, 'no manual currency selector');

  // Guinea locale → GNF (foreign currency, estimate shown)
  await act(async () => root.unmount());
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['fr-GN'] } });
  localStorage.removeItem(CURRENCY_STORAGE_KEY);
  currency.clearRatesCache();
  beginMount();
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ['/'] },
    React.createElement(AuthContext.Provider, { value: { session: null, loading: false, error: null, signIn: async () => { }, signOut: async () => { } } },
      React.createElement(ProductContext.Provider, { value: { state: { status: 'ready', products: [] }, refresh() { } } },
        React.createElement(CartContext.Provider, { value: { items: [], status: 'ready', error: null, dispatch() { }, beginCheckout: () => null, finishCheckout() { }, retry() { }, recovery: null, refreshSavedCart() { } } },
          React.createElement(CurrencyProvider, null,
            React.createElement(NotificationProvider, null,
              React.createElement(Layout, null)))))))));
  await settle();
  assert.equal(calls, 1, 'GNF foreign currency requests rates automatically');
  assert.equal(host.querySelectorAll('select').length, 0, 'still no manual selector');
});

test('OrderSummary guidance follows the foreign-only gate on every mounting shape', () => {
  localStorage.setItem(CURRENCY_STORAGE_KEY, 'NLE');
  const nle = renderToStaticMarkup(React.createElement(CurrencyProvider, null,
    React.createElement(OrderSummary, { subtotal: 3600, deliveryFee: 4000, estimates: true })));
  assert.match(nle, /^<dl class="totals">/);
  assert.doesNotMatch(nle, /estimate-note/);
  assert.doesNotMatch(nle, /Foreign amounts are estimates/);

  localStorage.setItem(CURRENCY_STORAGE_KEY, 'USD');
  const usd = renderToStaticMarkup(React.createElement(CurrencyProvider, null,
    React.createElement(OrderSummary, { subtotal: 3600, deliveryFee: 4000, estimates: true })));
  assert.match(usd, /class="estimate-note"/);
  assert.match(usd, /Foreign amounts are estimates\./);
  assert.match(usd, /Checkout and payment amounts remain in NLE\./);
  assert.match(usd, /An exchange-rate estimate is not a payment-provider quote\./);
  assert.ok(usd.indexOf('</dl>') < usd.indexOf('estimate-note'), 'the guidance renders after the totals list');

  // Historical shape: no estimates prop, no provider (order history) — quiet
  // and unchanged, and it must not throw.
  const bare = renderToStaticMarkup(React.createElement(OrderSummary, { subtotal: 3600, deliveryFee: 4000 }));
  assert.doesNotMatch(bare, /estimate-note/);
  assert.doesNotMatch(bare, /Foreign amounts are estimates/);
  assert.match(bare, /Total<\/dt><dd>NLE 76<\/dd>/);

  localStorage.setItem(CURRENCY_STORAGE_KEY, 'NLE');
});
