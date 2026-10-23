import assert from 'node:assert/strict';


import { test, before, after, afterEach } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Isolated account/order breadcrumb evidence. Supabase is replaced at the
// module boundary with an injected synthetic client; no credential, endpoint
// or hosted call is used. Synthetic sessions are fixtures, not live auth.
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver', 'FormData', 'sessionStorage', 'location']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (cb => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || clearTimeout;
const ElementProto = globalThis.Element?.prototype;
if (ElementProto && !ElementProto.scrollIntoView) ElementProto.scrollIntoView = () => { };
const { createRoot } = await import('react-dom/client');
let server, root, container;
const host = dom.window.document.getElementById('root');
let AccountPage, MyOrdersPage, OrderDetailPage, AuthContext, NotificationProvider;

const session = { access_token: 'synthetic-jwt', user: { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid' } };
const order = {
  id: '11111111-1111-4111-8111-111111111111',
  order_reference: 'LH-1234567890ABCDEF',
  created_at: '2026-10-03T10:00:00Z',
  total_cents: 55000,
  currency: 'NLE',
  fulfilment_method: 'delivery',
  status: 'placed',
  payment_status: 'awaiting_payment',
  full_name: 'Customer <example>',
  customer_email: 'customer@example.invalid',
  customer_phone: '+23276521208',
  delivery_street_address: 'A landmark',
  delivery_area: 'Lumley',
  delivery_city: 'Freetown',
  delivery_zone_label: 'Lumley to Congo Cross, including Aberdeen',
  delivery_instructions: null,
  pickup_location: null,
  payment_provider: 'orange',
  payment_phone_last4: '1208',
  subtotal_cents: 50000,
  delivery_fee_cents: 5000,
  order_items: [{ product_name: 'Historical candle', quantity: 2, unit_price_cents: 25000 }],
};

before(async () => {
  server = await createServer({
    configFile: false,
    envDir: false,
    server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: 'breadcrumb-fixture-client',
      enforce: 'pre',
      load(id) {
        if (id.replaceAll('\\', '/').endsWith('/src/lib/supabase/client.ts')) {
          return 'export function getSupabaseClient(){return globalThis.__breadcrumbClient;}';
        }
      },
    }],
  });
  ({ AccountPage } = await server.ssrLoadModule('/src/features/account/AccountPage.tsx'));
  ({ MyOrdersPage, OrderDetailPage } = await server.ssrLoadModule('/src/features/orders/OrderPages.tsx'));
  ({ AuthContext } = await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({ NotificationProvider } = await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
});

afterEach(async () => {
  if (root) { await act(async () => { root.unmount(); }); root = undefined; }
  if (container) { host.removeChild(container); container = null; }
  host.replaceChildren();
  delete globalThis.__breadcrumbClient;
});
after(async () => { await server.close(); dom.window.close(); });

function fakeClient({ detail = order, fail = false } = {}) {
  const calls = [];
  const ordersTable = {
    select: () => ordersTable,
    eq: () => ordersTable,
    order: () => ordersTable,
    range: () => ordersTable,
    maybeSingle: async () => {
      if (fail) throw new Error('order load failed');
      return { data: detail ?? null, error: null };
    },
  };
  const client = {
    calls,
    auth: { getSession: async () => ({ data: { session } }) },
    from(name) {
      calls.push({ table: name });
      if (name === 'orders') return ordersTable;
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      };
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
  return client;
}

const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const settle = async () => { await flush(); await flush(); await flush(); await flush(); };

async function mount(element, { path = '/account', authSession = null, loading = false, client } = {}) {
  globalThis.__breadcrumbClient = client ?? fakeClient();
  container = dom.window.document.createElement('div');
  host.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(MemoryRouter, { initialEntries: [path] },
        React.createElement(AuthContext.Provider, { value: { loading, session: authSession, error: null, signIn: async () => { }, signOut: async () => { } } },
          React.createElement(NotificationProvider, null,
            React.createElement(Routes, null,
              path.startsWith('/orders/') ? React.createElement(Route, { path: '/orders/:orderId/success', element: element })
                : path.startsWith('/account/orders/') ? React.createElement(Route, { path: '/account/orders/:orderId', element: element })
                : path === '/account/orders' ? React.createElement(Route, { path: '/account/orders', element: element })
                : React.createElement(Route, { path: '/account', element: element })
            )
          )
        )
      )
    );
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await settle();
}

const breadcrumb = () => host.querySelector('nav[aria-label="Breadcrumb"]');
const links = () => breadcrumb()?.querySelectorAll('a') ?? [];
const current = () => breadcrumb()?.querySelector('span[aria-current="page"]');

test('guest Account shows the shop breadcrumb trail and one h1', async () => {
  await mount(React.createElement(AccountPage));
  assert.equal(h1Count(), 1);
  assert.ok(breadcrumb());
  assert.equal(links().length, 1);
  assert.equal(links()[0]?.getAttribute('href'), '/');
  assert.equal(links()[0]?.textContent, 'Shop');
  assert.ok(current());
  assert.equal(current()?.textContent, 'Welcome to Lumé House.');
  assert.equal(current()?.tagName, 'SPAN');
});

test('restoring Account shows the breadcrumb trail while the session restores', async () => {
  await mount(React.createElement(AccountPage), { loading: true });
  assert.ok(breadcrumb());
  assert.equal(h1Count(), 1);
  assert.match(host.textContent, /Restoring your session/);
});

test('signed-in Account shows the breadcrumb trail and identity summary', async () => {
  await mount(React.createElement(AccountPage), { authSession: session });
  assert.ok(breadcrumb());
  assert.equal(h1Count(), 1);
  assert.match(host.textContent, /Your account/);
  assert.match(host.textContent, /Signed in with Google/);
  assert.match(host.textContent, /fixture@example\.invalid/);
});

test('guest My Orders shows the shop and account breadcrumb trail', async () => {
  await mount(React.createElement(MyOrdersPage), { path: '/account/orders' });
  assert.ok(breadcrumb());
  assert.equal(h1Count(), 1);
  assert.equal(links().length, 2);
  assert.equal(links()[0]?.getAttribute('href'), '/');
  assert.equal(links()[1]?.getAttribute('href'), '/account');
  assert.equal(current()?.textContent, 'Your orders.');
});

test('restoring My Orders shows the breadcrumb trail', async () => {
  await mount(React.createElement(MyOrdersPage), { path: '/account/orders', loading: true });
  assert.ok(breadcrumb());
  assert.equal(links().length, 2);
  assert.match(host.textContent, /Restoring your session/);
});

test('guest Order Details shows the full order breadcrumb trail', async () => {
  await mount(React.createElement(OrderDetailPage), { path: '/account/orders/11111111-1111-4111-8111-111111111111' });
  assert.ok(breadcrumb());
  assert.equal(h1Count(), 1);
  assert.equal(links().length, 3);
  assert.equal(links()[0]?.getAttribute('href'), '/');
  assert.equal(links()[1]?.getAttribute('href'), '/account');
  assert.equal(links()[2]?.getAttribute('href'), '/account/orders');
  assert.equal(current()?.textContent, 'Your order.');
  assert.match(host.textContent, /Sign in to view your orders/);
});

test('authorized Order Details settles to the order reference breadcrumb trail', async () => {
  await mount(React.createElement(OrderDetailPage), { path: '/account/orders/11111111-1111-4111-8111-111111111111', authSession: session });
  assert.ok(breadcrumb());
  assert.equal(h1Count(), 1);
  assert.equal(current()?.textContent, 'LH-1234567890ABCDEF');
  assert.match(host.textContent, /NLE 500/);
});

test('authorized Order Details ready shows one h1 and no hidden duplicate', async () => {
  await mount(React.createElement(OrderDetailPage), { path: '/account/orders/11111111-1111-4111-8111-111111111111', authSession: session, client: fakeClient({ detail: order }) });
  assert.ok(breadcrumb());
  assert.equal(h1Count(), 1);
  assert.equal(current()?.textContent, 'LH-1234567890ABCDEF');
  assert.equal(host.querySelector('h1[style]'), null);
  assert.match(host.textContent, /NLE 500/);
  assert.match(host.textContent, /Awaiting confirmation/);
});

test('authorized Order Details unavailable shows the breadcrumb trail', async () => {
  await mount(React.createElement(OrderDetailPage), { path: '/account/orders/11111111-1111-4111-8111-111111111111', authSession: session, client: fakeClient({ detail: null }) });
  assert.ok(breadcrumb());
  assert.equal(current()?.textContent, 'Your order.');
  assert.match(host.textContent, /This order is unavailable for your account/);
});

test('authorized Order Details error shows the breadcrumb trail and a retry button', async () => {
  await mount(React.createElement(OrderDetailPage), { path: '/account/orders/11111111-1111-4111-8111-111111111111', authSession: session, client: fakeClient({ fail: true }) });
  assert.ok(breadcrumb());
  assert.match(host.textContent, /Your order could not be loaded/);
  assert.ok(host.querySelector('button'));
});

test('Order Success shows the breadcrumb trail and the placed-awaiting-payment notice', async () => {
  await mount(React.createElement(OrderDetailPage, { success: true }), { path: '/orders/11111111-1111-4111-8111-111111111111/success', authSession: session, client: fakeClient({ detail: order }) });
  assert.ok(breadcrumb());
  assert.equal(h1Count(), 1);
  assert.match(host.textContent, /Your order has been placed/);
  assert.match(host.textContent, /Payment is awaiting confirmation/);
});

test('account fragment navigation keeps the breadcrumb trail', async () => {
  await mount(React.createElement(AccountPage), { path: '/account#personal-information', authSession: session });
  assert.ok(breadcrumb());
  assert.equal(h1Count(), 1);
});

test('breadcrumbs use real navigable ancestors with a single current page', async () => {
  await mount(React.createElement(OrderDetailPage), { path: '/account/orders/11111111-1111-4111-8111-111111111111', loading: true });
  assert.equal(host.querySelectorAll('nav[aria-label="Breadcrumb"]').length, 1);
  const links = [...breadcrumb()?.querySelectorAll('a') ?? []];
  assert.equal(links.length, 3);
  for (const link of links) {
    assert.ok(link.getAttribute('href'));
    assert.equal(link.hasAttribute('aria-current'), false);
  }
  assert.equal(current()?.tagName, 'SPAN');
  assert.equal(current()?.getAttribute('aria-current'), 'page');
});

test('restoring Order Details shows the full order breadcrumb trail', async () => {
  await mount(React.createElement(OrderDetailPage), { path: '/account/orders/11111111-1111-4111-8111-111111111111', loading: true });
  assert.ok(breadcrumb());
  assert.equal(links().length, 3);
  assert.equal(current()?.textContent, 'Your order.');
  assert.match(host.textContent, /Restoring your session/);
});
const h1Count = () => host.querySelectorAll('h1').length;