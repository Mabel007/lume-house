import assert from 'node:assert/strict';
import { test, before, after, afterEach, mock } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

// B2.7 currency presentation refinement evidence.
// Header lightened, footer-hosted manual selector, single-provider continuity
// across every selector, estimate guidance near totals and the CSS contract.
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

let server, root, container, CurrencyProvider, SiteFooter, Layout, OrderSummary, AuthContext, ProductContext, CartContext, NotificationProvider, currency;
let calls = 0;
const CURRENCY_STORAGE_KEY = 'lume:currency';
const rows = () => ['GNF', 'GHS', 'NGN', 'USD'].map((quote, i) => ({ base: 'SLE', date: referenceDate(), quote, rate: [552.74, .73113, 83.54, .06266][i] }));

const localelessNavigator = () => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: [], language: undefined } });
const serveRates = () => { globalThis.fetch = async () => { calls++; return new Response(JSON.stringify(rows()), { status: 200 }); }; };
const flush = async () => { await act(async () => { await new Promise(resolve => setImmediate(resolve)); }); };
const settle = async () => { for (let i = 0; i < 4; i += 1) await flush(); };
const selectFoot = async (code) => {
  await act(async () => {
    const control = host.querySelector('select[aria-label="Display currency"]');
    control.value = code;
    control.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await settle();
};

function beginMount() {
  container = dom.window.document.createElement('div');
  host.appendChild(container);
  root = createRoot(container);
}

async function mountFooter() {
  beginMount();
  await act(async () => root.render(React.createElement(MemoryRouter, null,
    React.createElement(CurrencyProvider, null,
      React.createElement(SiteFooter, null)))));
  await settle();
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
after(async () => { mock.timers.reset(); await server.close(); dom.window.close(); });

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
  ({ SiteFooter } = await server.ssrLoadModule('/src/components/SiteFooter.tsx'));
  ({ Layout } = await server.ssrLoadModule('/src/components/Layout.tsx'));
  ({ OrderSummary } = await server.ssrLoadModule('/src/features/checkout/OrderSummary.tsx'));
  ({ AuthContext } = await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({ ProductContext } = await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({ CartContext } = await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({ NotificationProvider } = await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
  currency = await server.ssrLoadModule('/src/features/currency/currency.ts');
});

test('source contract: header carries no currency control, footer hosts it before footer-bottom, guidance is gated', () => {
  const layout = readFileSync('src/components/Layout.tsx', 'utf8');
  assert.doesNotMatch(layout, /CurrencySelector|CurrencyDisclosure/);
  const footer = readFileSync('src/components/SiteFooter.tsx', 'utf8');
  assert.match(footer, /import \{ CurrencySelector, CurrencyDisclosure \} from "\.\.\/features\/currency\/CurrencySelector"/);
  assert.match(footer, /footer-currency/);
  assert.ok(footer.indexOf('footer-currency') >= 0 && footer.indexOf('footer-currency') < footer.indexOf('footer-bottom'), 'the currency block sits above footer-bottom');
  const summary = readFileSync('src/features/checkout/OrderSummary.tsx', 'utf8');
  assert.match(summary, /useOptionalCurrency/);
  assert.match(summary, /estimates && currency !== 'NLE'/);
  const css = readFileSync('src/styles.css', 'utf8');
  assert.match(css, /\.footer-currency \{[^}]*border-top: 1px solid #deddd1/);
  assert.match(css, /\.currency-label \{/);
  assert.match(css, /\.currency-estimate \{ display: block;[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.estimate-note \{/);
  assert.match(css, /\.currency-disclosure summary \{/);
  assert.match(css, /\.currency-selector select \{ min-height: 44px;/);
});

test('the primary navigation keeps its links and gains a footer-only currency select', async () => {
  serveRates();
  localStorage.setItem(CURRENCY_STORAGE_KEY, 'USD');
  await mountLayout();
  const headerLinks = [...host.querySelectorAll('.site-header .main-nav > a, .site-header .main-nav button')];
  assert.ok(headerLinks.some(a => (a.textContent || '').includes('Shop')));
  assert.ok(headerLinks.some(a => (a.textContent || '').includes('About')));
  assert.ok(headerLinks.some(a => (a.textContent || '').includes('Help')));
  assert.ok(headerLinks.some(a => (a.textContent || '').includes('Account') || a.textContent.includes('Cart')));
  assert.equal(host.querySelectorAll('.site-header select').length, 0, 'no currency select in the header');
  assert.equal(host.querySelectorAll('.footer-currency select[aria-label="Display currency"]').length, 1, 'exactly one footer select');
  assert.equal(host.querySelectorAll('select[aria-label="Display currency"]').length, 1, 'no duplicates anywhere on the page');
  const block = host.querySelector('.footer-currency');
  assert.match(block.textContent, /Display currency/);
  assert.equal(host.querySelectorAll('#currency-disclosure').length, 1);
  assert.equal(calls, 1, 'exactly one automatic rate request for the initial USD decision');
});

test('a fresh footer visitor on NLE sees the labeled control without any disclosure or rate request', async () => {
  localelessNavigator();
  serveRates();
  await mountFooter();
  assert.equal(calls, 0);
  assert.equal(host.querySelectorAll('select[aria-label="Display currency"]').length, 1);
  assert.equal(host.querySelector('select[aria-label="Display currency"]').value, 'NLE');
  assert.equal(host.querySelectorAll('#currency-disclosure').length, 0);
  assert.match(host.textContent, /Display currency/);
  assert.equal(host.querySelectorAll('.currency-estimate').length, 0);
});

test('switching through the footer select drives the shared provider once; returning to NLE never refetches', async () => {
  localelessNavigator();
  serveRates();
  await mountFooter();
  await selectFoot('USD');
  assert.equal(calls, 1, 'one Frankfurter request for the first foreign selection');
  assert.equal(host.querySelectorAll('#currency-disclosure').length, 1);
  const notice = host.querySelector('#currency-disclosure');
  assert.equal(notice.getAttribute('role'), null, 'no persistent live announcement');
  assert.equal(host.querySelector('select[aria-label="Display currency"]').getAttribute('aria-describedby'), 'currency-disclosure');
  assert.equal(notice.querySelector('details summary').textContent, 'Reference-rate details');
  assert.match(notice.textContent, /Foreign amounts are estimates\. Checkout and payment amounts remain in NLE\./);
  assert.match(notice.textContent, /Informational estimates from Frankfurter/);
  assert.equal(notice.querySelector('time').dateTime, referenceDate());
  assert.match(notice.textContent, /An exchange-rate estimate is not a payment-provider quote\./);
  assert.equal(host.querySelectorAll('#currency-disclosure').length, 1, 'single disclosure still holds');
  await selectFoot('NLE');
  assert.equal(host.querySelectorAll('#currency-disclosure').length, 0);
  assert.equal(calls, 1, 'returning to NLE still reuses the one request');
  assert.equal(host.querySelector('select[aria-label="Display currency"]').getAttribute('aria-describedby'), null);
});

test('the controlled clock alone decides validity: a simulated date far beyond the seven-day window still validates the fresh fixture', async () => {
  // Simulate running the suite when the system date is far past the old
  // hardcoded fixture's seven-day horizon. The reference date is re-derived
  // from the simulated clock, so production validation compares like against
  // like — the staleness policy is untouched and never weakened.
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date('2027-01-15T12:00:00Z') });
  try {
    localelessNavigator();
    serveRates();
    await mountFooter();
    assert.equal(host.querySelector('select[aria-label="Display currency"]').value, 'NLE');
    await selectFoot('USD');
    assert.equal(calls, 1, 'exactly one request under the simulated clock');
    const notice = host.querySelector('#currency-disclosure');
    assert.match(notice.textContent, /Informational estimates from Frankfurter/);
    assert.equal(notice.querySelector('time').dateTime, referenceDate());
    assert.equal(notice.querySelector('time').dateTime, '2027-01-15', 'the fixture date follows the simulated clock instead of a hardcoded value');
  } finally {
    mock.timers.reset();
    mock.timers.enable({ apis: ['Date'], now: new Date(FROZEN_NOW) });
  }
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
