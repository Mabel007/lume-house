// Deterministic reproduction only: real CartProvider + real direct-intent module,
// isolated local session storage and a stubbed Supabase boundary. No hosted use.
let CurrencyProvider;
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useEffect } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from './helpers/vite.mjs';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
const { document } = dom.window;
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'sessionStorage', 'localStorage'])
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const host = document.getElementById('root');

let server;
let root;
let CartProvider;
let ProductDetails;
let AuthContext;
let ProductContext;
let NotificationProvider;
let useCart;
let CartContext;
let direct;

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
const guestAuth = { loading: false, session: null, error: null, signIn: async () => {}, signOut: async () => {} };
const catalog = { state: { status: 'ready', products: [product] }, refresh() {} };
const productPath = `/products/${product.id}`;
const directKey = 'lume-direct-checkout-v1';
const guestKey = 'lume-guest-cart';

before(async () => {
  server = await createServer({
    configFile: false,
    envDir: false,
    server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: 'isolated-pdp03c-client',
      enforce: 'pre',
      load(id) {
        if (id.replaceAll('\\', '/').endsWith('/src/lib/supabase/client.ts'))
          return 'export function getSupabaseClient(){return globalThis.__pdp03cClient;}';
      },
    }],
  });
  ({ CurrencyProvider } = await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
  ({ CartProvider } = await server.ssrLoadModule('/src/features/cart/CartProvider.tsx'));
  ({ useCart, CartContext } = await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({ ProductDetails } = await server.ssrLoadModule('/src/features/products/ProductDetailsPage.tsx'));
  ({ AuthContext } = await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({ ProductContext } = await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({ NotificationProvider } = await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
  direct = await server.ssrLoadModule('/src/features/checkout/directIntent.ts');
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  host.replaceChildren();
  sessionStorage.clear();
  localStorage.clear();
  delete globalThis.__pdp03cClient;
  delete dom.window.__cart;
  delete dom.window.__nav;
  delete dom.window.__path;
  delete dom.window.__dispatchCalls;
});

after(async () => {
  await server?.close();
  dom.window.close();
});

function bagClient() {
  const calls = [];
  globalThis.__pdp03cClient = {
    rpc(name, args) {
      calls.push({ name, args });
      return { setHeader() { return Promise.resolve({ data: { id: 'cart-1', items: [] }, error: null }); } };
    },
  };
  return calls;
}

const state = () => direct.parseDirectState(sessionStorage.getItem(directKey) || '');
const guest = () => JSON.parse(sessionStorage.getItem(guestKey) || 'null');
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text);
const addButton = () => host.querySelector('button[aria-label="Add Fixture mug to Cart"]');
const notice = () => host.querySelector('.bag-notice');
const guidance = () => host.querySelector('.product-details-guidance');
const cartLink = () => host.querySelector('.product-details-actions a[href="/cart"]');
const describedBy = node => node?.getAttribute('aria-describedby');
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const click = async node => {
  await act(async () => {
    node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
};

function CartProbe() {
  const cart = useCart();
  useEffect(() => { dom.window.__cart = cart; }, [cart]);
  return null;
}

// Observes the real provider's dispatch without replacing persistence,
// rejection or any provider behavior: the PDP receives a delegating wrapper.
function DispatchSpy({ children }) {
  const cart = useCart();
  const value = {
    ...cart,
    dispatch(action) {
      dom.window.__dispatchCalls.push(action);
      return cart.dispatch(action);
    },
  };
  return React.createElement(CartContext.Provider, { value }, children);
}

function NavProbe() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    dom.window.__nav = navigate;
    dom.window.__path = pathname;
  }, [navigate, pathname]);
  return null;
}

function DirectReview() {
  const navigate = useNavigate();
  return React.createElement('div', null,
    React.createElement('p', null, 'Direct checkout review'),
    React.createElement('button', {
      type: 'button',
      onClick: () => {
        direct.cancelDirectIntent();
        navigate(productPath);
      },
    }, 'Cancel direct checkout'));
}

function CartReview() {
  return React.createElement('p', null, 'Cart review');
}

function tree(path) {
  const routes = React.createElement(Routes, null,
    React.createElement(Route, { path: productPath, element: React.createElement(ProductDetails, { product }) }),
    React.createElement(Route, { path: '/checkout/buy-now', element: React.createElement(DirectReview) }),
    React.createElement(Route, { path: '/cart', element: React.createElement(CartReview) }));
  const body = React.createElement(NotificationProvider, null,
    React.createElement(NavProbe, null),
    React.createElement(CartProbe, null),
    React.createElement(DispatchSpy, null, routes));
  return React.createElement(MemoryRouter, { initialEntries: [path] },
    React.createElement(AuthContext.Provider, { value: guestAuth },
      React.createElement(ProductContext.Provider, { value: catalog },
        React.createElement(CartProvider, null, body))));
}

function renderCurrency(element) {
  root.render(React.createElement(CurrencyProvider, null, element));
}

async function mount(path) {
  dom.window.__dispatchCalls = [];
  root = createRoot(host);
  await act(async () => { renderCurrency(tree(path)); await new Promise(resolve => setTimeout(resolve, 0)); });
  await flush();
}

async function reload(path) {
  if (root) await act(async () => root.unmount());
  root = null;
  host.replaceChildren();
  await mount(path);
}

async function navigate(path) {
  await act(async () => { dom.window.__nav(path); });
  await flush();
}

test('cancel, reload and explicit Cart entry reproduce the deferred Add hold without changing provider behavior', async () => {
  const calls = bagClient();
  await mount(productPath);

  const buy = button('Buy Now');
  assert.ok(buy, 'the PDP starts from a real Buy Now action');
  await click(buy);
  assert.equal(dom.window.__path, '/checkout/buy-now', 'Buy Now navigates to the real direct route');
  assert.equal(dom.window.__cart.status, 'deferred', 'the active direct route defers the real CartProvider');
  assert.equal(state().hold, true);
  assert.deepEqual(state().intent && { productId: state().intent.productId, variantId: state().intent.variantId, quantity: state().intent.quantity }, {
    productId: product.id, variantId: 'v-default', quantity: 1,
  });

  await click(button('Cancel direct checkout'));
  assert.equal(dom.window.__path, productPath, 'cancel navigates back to the PDP');
  assert.equal(state().hold, true, 'cancel leaves the direct hold armed');
  assert.equal(state().intent, null, 'cancel clears only the direct selection');

  await reload(productPath);
  assert.equal(state().hold, true, 'reload preserves the hold in session storage');
  assert.equal(dom.window.__cart.status, 'deferred', 'a fresh provider still reports deferred');
  const blockedAdd = addButton();
  assert.equal(blockedAdd.disabled, true, 'deferred status disables Add');
  assert.equal(guidance()?.textContent, 'Open your saved Cart before adding this piece.', 'deferred guidance is visible on the PDP');
  const guidanceId = describedBy(blockedAdd);
  assert.ok(guidanceId, 'the disabled Add is associated with the guidance');
  assert.equal(guidance()?.id, guidanceId, 'aria-describedby resolves to the visible guidance paragraph');
  assert.equal(cartLink()?.getAttribute('href'), '/cart', 'the existing Cart recovery link remains');
  const before = sessionStorage.getItem(guestKey);
  const holdBefore = sessionStorage.getItem(directKey);
  await click(blockedAdd);
  assert.deepEqual(dom.window.__dispatchCalls, [], 'a disabled Add never reaches dispatch');
  assert.equal(sessionStorage.getItem(guestKey), before, 'deferred Add does not mutate guest Cart storage');
  assert.equal(sessionStorage.getItem(directKey), holdBefore, 'deferred Add does not alter the direct hold');
  assert.equal(calls.length, 0, 'no trusted Cart RPC is attempted while deferred');
  assert.equal(notice(), null, 'a disabled Add publishes no failure toast');
  assert.equal(host.querySelector('[role="alert"]'), null, 'no extra failure announcement appears');
  assert.equal(dom.window.__path, productPath, 'clicking disabled Add does not navigate');

  await click(cartLink());
  assert.equal(dom.window.__path, '/cart', 'clicking the existing Cart link enters the Cart');
  assert.equal(state().hold, false, 'explicit Cart entry is the only tested hold release');
  assert.equal(dom.window.__cart.status, 'ready', 'normal saved/guest Cart restoration resumes');

  await navigate(productPath);
  assert.equal(addButton().disabled, false, 'returning to the PDP restores normal Add behavior');
  assert.equal(describedBy(addButton()), null, 'normal Add has no deferred guidance association');
  await click(addButton());
  assert.equal(dom.window.__dispatchCalls.length, 1, 'normal Add reaches dispatch exactly once');
  assert.deepEqual(dom.window.__dispatchCalls[0], { type: 'add', productId: product.id, variantId: 'v-default', quantity: 1 });
  assert.equal(guest()?.items.length, 1);
  assert.equal(guest().items[0].productId, product.id);
  assert.equal(guest().items[0].variantId, 'v-default');
  assert.equal(guest().items[0].quantity, 1, 'normal Add mutations resume after explicit Cart entry');
  assert.match(notice()?.textContent || '', /Added 1 × Fixture mug to your Cart/);
  assert.equal(calls.length, 0, 'guest Add remains local after the hold is released');
});

test('plain back navigation without cancel also reloads into the same deferred hold', async () => {
  bagClient();
  await mount(productPath);
  await click(button('Buy Now'));
  const intentId = state().intent.id;
  assert.equal(dom.window.__cart.status, 'deferred');

  await navigate(productPath);
  assert.equal(state().hold, true, 'navigating away from direct checkout does not release the hold');
  assert.equal(state().intent?.id, intentId, 'the direct intent survives back navigation');

  await reload(productPath);
  assert.equal(dom.window.__cart.status, 'deferred', 'reload still defers after plain back navigation');
  assert.equal(state().intent?.id, intentId, 'the held direct intent survives the remount');
  const stillBlocked = addButton();
  assert.equal(stillBlocked.disabled, true, 'Add stays disabled after plain back and remount');
  assert.equal(guidance()?.textContent, 'Open your saved Cart before adding this piece.');
  assert.equal(guidance()?.id, describedBy(stillBlocked));
  const holdAfterBack = sessionStorage.getItem(directKey);
  await click(stillBlocked);
  assert.deepEqual(dom.window.__dispatchCalls, [], 'a deferred Add after plain back cannot invoke dispatch');
  assert.equal(sessionStorage.getItem(directKey), holdAfterBack, 'the held direct intent is unchanged by the blocked Add');
  assert.equal(notice(), null, 'no checkout or cart side-effect toast appears');
  assert.equal(dom.window.__path, productPath, 'the blocked Add does not navigate');

  await navigate('/cart');
  assert.equal(state().hold, false);
  assert.equal(dom.window.__cart.status, 'ready');
});
