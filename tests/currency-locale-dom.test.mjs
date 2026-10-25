import assert from 'node:assert/strict';
import { test, before, after, afterEach } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// B2.7 automatic display-currency selection evidence.
// Supabase is substituted at the module boundary; navigator Intl preferences
// are stubbed as plain objects. No credential, endpoint or hosted call is
// made and no real FX request leaves the process: the Frankfurter endpoint is
// intercepted via fetch replacement and counted.

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver', 'FormData', 'sessionStorage', 'localStorage']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (cb => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || clearTimeout;
const ElementProto = globalThis.Element?.prototype;
if (ElementProto && !ElementProto.scrollIntoView) ElementProto.scrollIntoView = () => { };
dom.window.scrollTo = () => { };
const nativeFetch = globalThis.fetch;
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const { createRoot } = await import('react-dom/client');

let server, root, container, CurrencyProvider, CurrencySelector, CurrencyDisclosure, ProductContext, CartContext, AuthContext, NotificationProvider, ShopPage, ProductDetailsPage, CheckoutPage, currency;
const host = dom.window.document.getElementById('root');
let calls = 0;
const CURRENCY_STORAGE_KEY = 'lume:currency';
const RATES_STORAGE_KEY = 'lume:fx:SLE';

const rows = (patch = {}) => ['GNF', 'GHS', 'NGN', 'USD'].map((quote, i) => ({ base: 'SLE', date: new Date().toISOString().slice(0, 10), quote, rate: [552.74, 0.73113, 83.54, 0.06266][i], ...patch }));
function serve(body = rows(), status = 200) {
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify(body), { status }); };
}
function setLocales(languages, language = languages[0]) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages, language } });
}
const stampLocalStorageUnavailable = () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem() { throw new Error('storage unavailable'); }, setItem() { throw new Error('storage unavailable'); }, removeItem() { throw new Error('storage unavailable'); }, clear() { throw new Error('storage unavailable'); } },
  });
};
const persistedPreference = () => localStorage.getItem(CURRENCY_STORAGE_KEY);
const selectedCurrency = () => host.querySelector('select[aria-label="Display currency"]')?.value;
const estimates = () => [...host.querySelectorAll('.currency-estimate')].map(e => e.textContent);
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const settle = async () => { for (let i = 0; i < 5; i += 1) await flush(); };

const product = { id: 'fixture-mug', name: 'Fixture mug', description: 'Local test', category: 'Ceramics', price: 1800, image: '/images/mug.svg', color: '#e9e3d8', variants: [{ id: 'v-mug', productId: 'fixture-mug', options: {}, isDefault: true, price: 1800, currency: 'NLE', inventoryPolicy: 'untracked' }] };
const item = { productId: product.id, variantId: 'v-mug', quantity: 2 };
const session = { access_token: 'synthetic', user: { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid' } };

before(async () => {
  server = await createServer({
    configFile: false,
    envDir: false,
    server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: 'currency-locale-fixture-client',
      enforce: 'pre',
      load(id) {
        if (id.replaceAll('\\', '/').endsWith('/src/lib/supabase/client.ts')) {
          return 'export function getSupabaseClient(){return globalThis.__localeClient;}';
        }
      },
    }],
  });
  ({ CurrencyProvider } = await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
  ({ CurrencySelector, CurrencyDisclosure } = await server.ssrLoadModule('/src/features/currency/CurrencySelector.tsx'));
  currency = await server.ssrLoadModule('/src/features/currency/currency.ts');
  ({ ProductContext } = await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({ CartContext } = await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({ AuthContext } = await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({ NotificationProvider } = await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
  ({ ShopPage } = await server.ssrLoadModule('/src/features/products/ShopPage.tsx'));
  ({ ProductDetailsPage } = await server.ssrLoadModule('/src/features/products/ProductDetailsPage.tsx'));
  ({ CheckoutPage } = await server.ssrLoadModule('/src/features/checkout/CheckoutPage.tsx'));
});

const client = () => ({
  from() {
    return {
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({ data: { full_name: 'Fixture Customer', phone: '+23276521208', default_street_address: '12 Fixture Street', default_area: 'Lumley', default_city: 'Freetown' }, error: null }),
    };
  },
  functions: { invoke: async () => ({ data: null, error: null }) },
});

async function mount(path = '/', { strict = false, cart = [] } = {}) {
  globalThis.__localeClient = client();
  container = dom.window.document.createElement('div');
  host.appendChild(container);
  root = createRoot(container);
  const tree = React.createElement(MemoryRouter, { initialEntries: [path] },
    React.createElement(AuthContext.Provider, { value: { session, loading: false, error: null, signIn: async () => { }, signOut: async () => { } } },
      React.createElement(ProductContext.Provider, { value: { state: { status: 'ready', products: [product] }, refresh() { } } },
        React.createElement(CartContext.Provider, { value: { items: cart, status: 'ready', error: null, dispatch() { }, beginCheckout: () => 1, finishCheckout() { } } },
          React.createElement(CurrencyProvider, null,
            React.createElement(NotificationProvider, null,
              React.createElement(Routes, null,
                React.createElement(Route, { path: '/', element: React.createElement(ShopPage) }),
                React.createElement(Route, { path: '/products/:productId', element: React.createElement(ProductDetailsPage) }),
                React.createElement(Route, { path: '/checkout', element: React.createElement(CheckoutPage) })),
              React.createElement(CurrencySelector, null),
              React.createElement(CurrencyDisclosure, null)))))));
  await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, tree) : tree));
  await settle();
}

async function select(code) {
  await act(async () => {
    const control = host.querySelector('select[aria-label="Display currency"]');
    control.value = code;
    control.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await settle();
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined;
  if (container) { host.removeChild(container); container = null; }
  host.replaceChildren();
  // Restore storage/navigator first so clearing leftover state cannot throw.
  if (originalLocalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalLocalStorageDescriptor);
  localStorage.clear();
  sessionStorage.clear();
  currency.clearRatesCache();
  if (originalNavigatorDescriptor) Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  else delete globalThis.navigator;
  globalThis.fetch = nativeFetch;
  delete globalThis.__localeClient;
  calls = 0;
});
after(async () => { await server.close(); dom.window.close(); });

test('a fresh Sierra Leone visitor keeps the authoritative NLE and never requests rates', async () => {
  serve();
  setLocales(['sl-SL']);
  await mount('/');
  assert.equal(calls, 0);
  assert.equal(selectedCurrency(), 'NLE');
  assert.deepEqual(estimates(), []);
  assert.equal(host.querySelector('#currency-disclosure'), null);
  assert.equal(persistedPreference(), 'NLE');
  assert.match(host.textContent, /NLE 18/);
});

test('a fresh Sierra Leone visitor via an English locale tag is still recognised by region', async () => {
  serve();
  setLocales(['en-SL', 'en-GB']);
  await mount('/');
  assert.equal(calls, 0);
  assert.equal(selectedCurrency(), 'NLE');
  assert.deepEqual(estimates(), []);
  assert.equal(persistedPreference(), 'NLE');
});

for (const [locales, code] of [
  [['gh-GH'], 'GHS'], [['fr-GN'], 'GNF'], [['ig-NG'], 'NGN'],
  [['en-US'], 'USD'], [['en_US'], 'USD'], [['en-us'], 'USD'],
]) test(`a fresh visitor from ${locales[0]} auto-selects ${code} exactly once from the cached rate chain`, async () => {
  serve();
  setLocales(locales);
  await mount('/');
  assert.equal(calls, 1);
  assert.equal(selectedCurrency(), code);
  assert.ok(estimates().length >= 1);
  assert.ok(estimates().every(value => value.includes(code)));
  assert.match(host.textContent, /NLE 18/);
  const notice = host.querySelector('#currency-disclosure');
  assert.match(notice.textContent, /Informational estimates from Frankfurter/);
  assert.match(notice.textContent, /Checkout and payment amounts remain in NLE/);
  assert.equal(persistedPreference(), code);
});

for (const locales of [['en'], ['fr-FR'], ['de-DE'], ['en-419'], ['zh-Hant'], ['und'], ['!!!'], ['abcd-XY'], ['123-US'], ['x-private'], ['en-u-sd-sl'], ['en-US-u'], ['en-US-x'], ['en-US-NG'], ['en-Latn-Latn-US'], ['en-US-!']]) {
  test(`unsupported (${locales[0]}) or malformed locale falls back to NLE without any FX call`, async () => {
    serve();
    setLocales(locales.length ? locales : ['und']);
    await mount('/');
    assert.equal(calls, 0);
    assert.equal(selectedCurrency(), 'NLE');
    assert.deepEqual(estimates(), []);
    assert.equal(persistedPreference(), 'NLE');
  });
}

test('a stored manual selection overrides a matching foreign locale', async () => {
  serve();
  setLocales(['en-US']);
  localStorage.setItem(CURRENCY_STORAGE_KEY, 'GHS');
  await mount('/');
  assert.equal(selectedCurrency(), 'GHS');
  assert.equal(calls, 1);
  assert.equal(persistedPreference(), 'GHS');
  assert.ok(estimates().every(value => value.includes('GHS')));
});

test('an explicitly saved NLE overrides a foreign locale and requests no rates', async () => {
  serve();
  setLocales(['en-US']);
  localStorage.setItem(CURRENCY_STORAGE_KEY, 'NLE');
  await mount('/');
  assert.equal(calls, 0);
  assert.equal(selectedCurrency(), 'NLE');
  assert.deepEqual(estimates(), []);
  assert.equal(persistedPreference(), 'NLE');
  assert.match(host.textContent, /NLE 18/);
});

test('an invalid stored preference is replaced by one region-based decision', async () => {
  serve();
  setLocales(['gh-GH']);
  localStorage.setItem(CURRENCY_STORAGE_KEY, 'fantasy-code');
  await mount('/');
  assert.equal(selectedCurrency(), 'GHS');
  assert.equal(calls, 1);
  assert.equal(persistedPreference(), 'GHS');
});

test('localStorage unavailable neither crashes nor mislabels and never persists', async () => {
  stampLocalStorageUnavailable();
  serve();
  setLocales(['en-US']);
  await mount('/');
  assert.equal(selectedCurrency(), 'USD');
  assert.equal(calls, 1);
  assert.ok(host.querySelector('select[aria-label="Display currency"]'));
  assert.doesNotMatch(host.textContent, /Available|error/i);
  assert.match(host.textContent, /Checkout and payment amounts remain in NLE/);
  // Restore only the real storage for the persistence assertion.
  if (originalLocalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalLocalStorageDescriptor);
  assert.equal(persistedPreference(), null);
});

test('StrictMode double mount of the provider issues exactly one automatic rate request', async () => {
  serve();
  setLocales(['en-US']);
  await mount('/', { strict: true });
  assert.equal(calls, 1);
  assert.equal(selectedCurrency(), 'USD');
  assert.equal(estimates().length, 1);
});

test('provider remount and route change keep the automatic choice without a second request', async () => {
  serve();
  setLocales(['en-US']);
  await mount('/');
  assert.equal(calls, 1);
  await act(async () => root.unmount());
  await mount('/products/fixture-mug');
  assert.equal(calls, 1);
  assert.equal(selectedCurrency(), 'USD');
  assert.ok(estimates().length >= 1);
  assert.ok(estimates().every(value => value.includes('USD')));
  assert.match(host.textContent, /NLE 18/);
});

test('switching away from the automatic choice and back never duplicates the request', async () => {
  serve();
  setLocales(['en-US']);
  await mount('/');
  assert.equal(calls, 1);
  await select('NLE');
  assert.deepEqual(estimates(), []);
  assert.equal(calls, 1);
  assert.equal(persistedPreference(), 'NLE');
  assert.match(host.textContent, /NLE 18/);
  await select('USD');
  assert.ok(estimates().length >= 1);
  assert.equal(calls, 1);
  assert.equal(persistedPreference(), 'USD');
});

test('a stale cached rate is revalidated once and the stale value never displays', async () => {
  serve();
  setLocales(['en-US']);
  localStorage.setItem(CURRENCY_STORAGE_KEY, 'USD');
  localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({
    storedAt: Date.now() - 25 * 60 * 60 * 1000,
    payload: rows({ rate: 5 }),
  }));
  await mount('/');
  await settle();
  assert.equal(calls, 1);
  assert.ok(estimates().length >= 1);
  assert.ok(estimates().every(value => value.includes('USD') && !value.includes('90.00')));
  assert.match(host.textContent, /NLE 18/);
});

test('checkout totals stay authoritative NLE while foreign estimates stay clearly labelled', async () => {
  serve();
  setLocales(['en-US']);
  await mount('/checkout', { cart: [item] });
  assert.equal(calls, 1);
  assert.match(host.textContent, /NLE 36/);
  assert.ok(estimates().length >= 1);
  assert.ok(estimates().every(value => value.includes('USD')));
  assert.doesNotMatch(host.textContent, /Total\s*USD/);
});
