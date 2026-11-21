// Codex P2 regression: the real /cart route composes Layout (shell-level saved-Cart
// status) with CartPage (route-level panel). Before this correction both levels were
// live regions, so a saved-Cart load or failure was announced twice. These cases mount
// that actual composition, not Layout with a placeholder child.
// Evidence class: real components, jsdom, synthetic session and synthetic RPC client.
import assert from 'node:assert/strict';
import { test, before, after, afterEach } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from './helpers/vite.mjs';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
dom.window.scrollTo = () => {};
const { document } = dom.window;
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'HTMLInputElement', 'HTMLButtonElement', 'sessionStorage', 'MouseEvent', 'Event']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');

const product = {
  id: 'fixture-mug',
  name: 'Fixture mug',
  description: 'Fixture description',
  category: 'Fixture category',
  price: 1800,
  image: '/images/mug.svg',
  color: '#e9e3d8',
  variants: [{ id: 'v-default', productId: 'fixture-mug', options: {}, isDefault: true, price: 1800, currency: 'NLE', inventoryPolicy: 'untracked' }],
};
const catalog = { state: { status: 'ready', products: [product] }, refresh() {} };
const auth = {
  loading: false,
  session: { user: { id: 'user-1' }, access_token: 'synthetic-test-jwt' },
  error: null,
  signIn: async () => {},
  signOut: async () => {},
};
const oneLine = { id: 'cart-1', items: [{ product_id: 'fixture-mug', variant_id: 'v-default', quantity: 1 }] };

let server, root;
let CurrencyProvider, CartProvider, CartPage, Layout, AuthContext, ProductContext, NotificationProvider;

before(async () => {
  server = await createServer({
    configFile: false,
    envDir: false,
    server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: 'isolated-composed-cart-client',
      enforce: 'pre',
      load(id) {
        if (id.replaceAll('\\', '/').endsWith('/src/lib/supabase/client.ts'))
          return 'export function getSupabaseClient(){return globalThis.__cartAnnouncementClient;}';
      },
    }],
  });
  ({ CurrencyProvider } = await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
  ({ CartProvider } = await server.ssrLoadModule('/src/features/cart/CartProvider.tsx'));
  ({ CartPage } = await server.ssrLoadModule('/src/features/cart/CartPage.tsx'));
  ({ Layout } = await server.ssrLoadModule('/src/components/Layout.tsx'));
  ({ AuthContext } = await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({ ProductContext } = await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({ NotificationProvider } = await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined;
  document.getElementById('root').replaceChildren();
  sessionStorage.clear();
  delete globalThis.__cartAnnouncementClient;
});
after(async () => { await server?.close(); dom.window.close(); });

/** A RPC stub whose load and change answers are supplied per test. */
function client({ load = () => Promise.resolve({ data: { id: 'cart-1', items: [] }, error: null }), change = () => Promise.resolve({ data: { id: 'cart-1', items: [] }, error: null }) } = {}) {
  const calls = [];
  globalThis.__cartAnnouncementClient = {
    rpc(name, args) {
      calls.push({ name, args });
      const answer = name === 'load_variant_cart' ? load() : name === 'change_variant_cart' ? change(args) : Promise.resolve({ data: null, error: null });
      return { setHeader() { return answer; } };
    },
  };
  return calls;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const host = () => document.getElementById('root');
const find = selector => host().querySelector(selector);
const all = selector => [...host().querySelectorAll(selector)];
/** Live regions with something to say: the announcements a reader actually hears. */
const speaking = () => all('[role="alert"],[role="status"],[aria-live]')
  .filter(node => node.textContent.trim() && !node.closest('[aria-hidden="true"]'));

async function tick() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function mount(element) {
  root = createRoot(host());
  await act(async () => {
    root.render(React.createElement(CurrencyProvider, null, element));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
async function settle(gate, value) {
  await act(async () => { gate.resolve(value); await new Promise(resolve => setTimeout(resolve, 0)); });
}

/** The production route shape: Layout is the parent route and CartPage is its Outlet. */
function composedCart() {
  const routes = React.createElement(Routes, null,
    React.createElement(Route, { element: React.createElement(Layout) },
      React.createElement(Route, { path: '/cart', element: React.createElement(CartPage) })));
  return React.createElement(MemoryRouter, { initialEntries: ['/cart'] },
    React.createElement(AuthContext.Provider, { value: auth },
      React.createElement(ProductContext.Provider, { value: catalog },
        React.createElement(CartProvider, null,
          React.createElement(NotificationProvider, null, routes)))));
}

test('a saved-Cart load has exactly one polite announcement in the composed Cart route', async () => {
  const load = deferred();
  client({ load: () => load.promise });
  await mount(composedCart());

  const routePanel = find('.page-section .ui-status-loading');
  assert.ok(routePanel, 'CartPage still shows its own visible pending panel');
  assert.equal(routePanel.querySelector('.ui-status-copy').textContent, 'Your saved Cart is not ready yet.');
  assert.equal(routePanel.getAttribute('role'), null, 'the in-page duplicate must not speak');
  assert.equal(routePanel.getAttribute('aria-live'), null, 'the in-page duplicate must not speak');

  const announced = speaking();
  assert.equal(announced.length, 1, 'one saved-Cart load is announced once');
  assert.equal(announced[0].getAttribute('role'), 'status');
  assert.equal(announced[0].textContent.trim(), 'Loading your Cart…', 'the shell keeps its specific wording');
  assert.equal(all('[role="alert"]').length, 0, 'a pending load is not a failure');
  await settle(load, { data: { id: 'cart-1', items: [] }, error: null });
});

test('a saved-Cart failure with a ready catalogue has one assertive owner and keeps Retry', async () => {
  client({ load: () => Promise.resolve({ data: null, error: { message: 'synthetic restore failure' } }) });
  await mount(composedCart());

  const panels = all('.ui-status-error');
  assert.equal(panels.length, 2, 'both the shell error and the route-level fallback stay visible');
  const shell = panels.find(node => node.classList.contains('wrap'));
  const routePanel = panels.find(node => !node.classList.contains('wrap'));
  assert.ok(shell, 'the shell still carries the specific error and its action');
  assert.ok(routePanel, 'the CartPage fallback is still visible');
  assert.equal(routePanel.querySelector('.ui-status-copy').textContent, 'Your saved Cart is not ready yet.');
  assert.equal(routePanel.getAttribute('role'), null, 'the fallback does not announce the same failure');
  assert.equal(routePanel.getAttribute('aria-live'), null, 'the fallback does not announce the same failure');

  const alerts = all('[role="alert"]');
  assert.equal(alerts.length, 1, 'one failed load is announced once');
  assert.equal(alerts[0], shell);
  assert.equal(alerts[0].getAttribute('aria-live'), 'assertive');
  assert.match(alerts[0].textContent, /Your saved Cart could not be restored or merged\. Unsaved guest items are retained\. Please retry\./);
  const retry = [...shell.querySelectorAll('button')].find(node => node.textContent === 'Retry saved Cart');
  assert.ok(retry, 'the retry action is still attached to the one announcement');
  assert.equal(all('[role="status"]').filter(node => node.textContent.includes('not ready yet')).length, 0, 'no polite duplicate of the failure');
});

test('Retry saved Cart returns to the same single-announcement ownership and then settles', async () => {
  const secondLoad = deferred();
  let loads = 0;
  client({
    load: () => {
      loads += 1;
      return loads === 1 ? Promise.resolve({ data: null, error: { message: 'synthetic restore failure' } }) : secondLoad.promise;
    },
  });
  await mount(composedCart());
  const retry = [...find('.ui-status-error.wrap').querySelectorAll('button')].find(node => node.textContent === 'Retry saved Cart');
  assert.ok(retry);
  await act(async () => { retry.click(); await new Promise(resolve => setTimeout(resolve, 0)); });

  assert.equal(loads, 2, 'the retry re-reads the saved Cart');
  const loading = speaking();
  assert.equal(loading.length, 1, 'the retry load is announced once');
  assert.equal(loading[0].textContent.trim(), 'Loading your Cart…');
  await settle(secondLoad, { data: { id: 'cart-1', items: [] }, error: null });
  assert.equal(all('.ui-status-error').length, 0, 'a successful retry clears both panels');
  assert.equal(all('[role="alert"]').length, 0, 'the failure is not announced after it clears');
});

test('a failed removal still announces once, offers recovery and keeps the keyboard caller focused', async () => {
  client({
    load: () => Promise.resolve({ data: oneLine, error: null }),
    change: () => Promise.reject(new TypeError('Failed to fetch')),
  });
  await mount(composedCart());
  const remove = find('[data-cart-remove]');
  assert.ok(remove, 'the saved line is present');
  await act(async () => { remove.focus(); });
  assert.equal(document.activeElement, remove);
  await act(async () => {
    remove.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, detail: 0 }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  assert.equal(all('.bag-notice-region[aria-live="assertive"] .bag-notice').length, 1, 'the action failure is announced once');
  assert.match(find('.bag-notice').textContent, /couldn't confirm removing Fixture mug from your Cart/);
  assert.equal(all('[role="alert"]').length, 0, 'no second global alert duplicates the removal failure');
  assert.ok(find('.cart-recovery'), 'the unconfirmed removal still offers reconciliation');
  assert.match(find('.cart-recovery').textContent, /couldn't confirm your last Cart change/);
  assert.equal(document.activeElement, remove, 'the focused remove control stays available for a retry');
});

test('a successful keyboard removal keeps its single toast and moves focus to the empty title', async () => {
  client({
    load: () => Promise.resolve({ data: oneLine, error: null }),
    change: () => Promise.resolve({ data: { id: 'cart-1', items: [] }, error: null }),
  });
  await mount(composedCart());
  const remove = find('[data-cart-remove]');
  assert.ok(remove);
  await act(async () => { remove.focus(); });
  await act(async () => {
    remove.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, detail: 0 }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await tick();

  assert.equal(find('[data-cart-remove]'), null, 'the line is removed');
  assert.equal(all('.bag-notice').length, 1, 'the successful removal has one toast');
  assert.match(find('.bag-notice').textContent, /Removed Fixture mug from your Cart/);
  assert.equal(all('.bag-notice-region[aria-live="polite"] .bag-notice').length, 1, 'success is announced politely once');
  assert.equal(all('.bag-notice-region[aria-live="assertive"] .bag-notice').length, 0, 'success is not announced as a failure');
  const emptyTitle = find('[data-cart-empty-title]');
  assert.ok(emptyTitle, 'the empty state replaces the line');
  assert.equal(document.activeElement, emptyTitle, 'focus follows the approved empty-state destination');
});
