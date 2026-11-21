// Slice C moved customer-facing success, failure, pending and empty messages onto the shared
// status panel. The risk in that work is not the styling: it is that one shopper action ends up
// announced twice (or not at all), that pending work stops looking like pending work, and that
// error wording gets reworded in passing. These cases render the real components and pin the
// announcement count, the live-region semantics and the exact strings the shopper reads.
// Evidence class: real components, jsdom, synthetic session and synthetic Supabase client.
// No hosted data, no sign-in, no network.
import assert from 'node:assert/strict';
import { test, before, after, afterEach } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from './helpers/vite.mjs';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const { document } = dom.window;
for (const name of ['window', 'document', 'Element', 'Node', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid' };
const session = { access_token: 'synthetic-jwt', user };
const authValue = (over = {}) => ({ loading: false, session, error: null, signIn: async () => {}, signOut: async () => {}, ...over });

let server;
before(async () => {
  server = await createServer({
    root: process.cwd(),
    configFile: false,
    envDir: false,
    server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: 'isolated-status-client',
      enforce: 'pre',
      load(id) {
        if (id.replaceAll('\\', '/').endsWith('/src/lib/supabase/client.ts')) {
          return 'export function getSupabaseClient(){return globalThis.__statusTestClient;}';
        }
      },
    }],
  });
});
after(async () => { await server?.close(); delete globalThis.__statusTestClient; });

const load = (source) => server.ssrLoadModule(source);

/** A write the test releases by hand, so the pending state can actually be observed. */
function gate(value) {
  let settle;
  const promise = new Promise(resolve => { settle = () => resolve(value); });
  return { promise, settle };
}

/**
 * Every PostgREST chain the features build resolves through `result`, which may be a promise so a
 * request stays in flight. `rpc` is handed the call so a mutation can be gated by name.
 */
function clientStub({ result, rpc = async () => ({ data: null, error: null }) } = {}) {
  const settled = () => Promise.resolve(result ?? { data: null, error: null });
  // The chain stays a chain: only a terminal reader produces the response, and awaiting the
  // builder itself is how the features that skip maybeSingle read it.
  const builder = { maybeSingle: settled, single: settled, then: (resolve, reject) => settled().then(resolve, reject) };
  for (const method of ['select', 'eq', 'order', 'range', 'limit', 'in', 'gte', 'neq', 'setHeader']) {
    builder[method] = () => builder;
  }
  return { from: () => builder, rpc, auth: { getSession: async () => ({ data: { session } }) } };
}

let root;
/** Wrap a tree in `[Context, value]` layers, innermost last. */
const withProviders = (layers, leaf) => layers.reduceRight(
  (child, [Context, value]) => React.createElement(Context, { value }, child), leaf);
async function mount(node, { path = '/', route } = {}) {
  // A test may render a second state of the same component; one container holds one root.
  if (root) await act(async () => { root.unmount(); });
  root = createRoot(document.getElementById('root'));
  const tree = React.createElement(MemoryRouter, { initialEntries: [path] }, route
    ? React.createElement(Routes, null, React.createElement(Route, { path: route, element: node }))
    : node);
  await act(async () => { root.render(tree); });
}
afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  root = undefined;
  delete globalThis.__statusTestClient;
});

const scope = () => document.getElementById('root');
const find = (selector) => scope().querySelector(selector);
const all = (selector) => [...scope().querySelectorAll(selector)];
/** Live regions with something to say, which is what an announcement actually is. */
const announced = () => all('[role="alert"],[role="status"],[aria-live]')
  .filter(node => node.textContent.trim() && !node.closest('[aria-hidden="true"]'));
const parse = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document.body;

test('C1/C3 the shared panel gives each kind exactly one announcement', async () => {
  const { UiStatus } = await load('/src/components/UiStatus.tsx');
  const panel = (kind, extra) => parse(renderToStaticMarkup(
    React.createElement(UiStatus, { kind, action: React.createElement('button', { type: 'button' }, 'Try again'), ...extra }, 'The message.')
  )).querySelector('.ui-status');

  assert.equal(panel('error').getAttribute('role'), 'alert');
  assert.equal(panel('error').getAttribute('aria-live'), 'assertive');
  assert.equal(panel('error').querySelector('.ui-skeleton'), null, 'a failure is not a skeleton');
  for (const kind of ['loading', 'empty']) {
    const node = panel(kind);
    assert.equal(node.getAttribute('role'), 'status', `${kind} must stay polite`);
    assert.equal(node.getAttribute('aria-live'), 'polite', `${kind} must not interrupt`);
  }
  assert.ok(panel('loading').querySelector('.ui-skeleton'), 'loading shows the visible pending treatment');
  assert.equal(panel('error').querySelector('.ui-status-copy').textContent, 'The message.');
  assert.equal(panel('error').querySelector('.ui-status-action button').textContent, 'Try again');

  // The narrow extension: a caller may place the panel in a layout container, but the shared
  // panel's own classes must survive, or the styling and these selectors both fall away.
  const classes = panel('error', { className: 'wrap' }).getAttribute('class').split(/\s+/);
  for (const required of ['ui-status', 'ui-status-error', 'wrap']) {
    assert.ok(classes.includes(required), `extended panel must keep ${required}`);
  }
});

test('C2 a saved-cart failure is now a visible alert panel beside, not inside, the recovery notice', async () => {
  const { Layout } = await load('/src/components/Layout.tsx');
  const { AuthContext } = await load('/src/features/auth/AuthContext.ts');
  const { CartContext } = await load('/src/features/cart/CartContext.ts');
  const { ProductContext } = await load('/src/features/products/ProductContext.ts');
  const items = [{ productId: 'p-1', variantId: 'v-1', name: 'Sheet set', quantity: 1, priceCents: 25000, currency: 'NLE', image: '', available: true }];
  const cart = (over) => ({ items, error: null, recovery: null, retry() {}, refreshSavedCart() {}, ...over });
  const routes = React.createElement(Routes, null,
    React.createElement(Route, { element: React.createElement(Layout) },
      React.createElement(Route, { path: '*', element: React.createElement('h1', null, 'Cart') })));
  // The header's bell and account menu are signed-in surfaces; this case is about the cart banner,
  // so the guest shell keeps the render to the parts under test.
  const render = (cartState) => parse(renderToStaticMarkup(withProviders([
    [AuthContext, authValue({ session: null })],
    [ProductContext, { state: { status: 'loading' }, refresh() {} }],
    [CartContext, cartState],
  ], React.createElement(MemoryRouter, { initialEntries: ['/cart'] }, routes))));

  const body = render(cart({ status: 'error', error: 'Your saved Cart could not be loaded.' }));
  const alerts = [...body.querySelectorAll('[role="alert"]')];
  assert.equal(alerts.length, 1, 'one failed load must be announced once');
  const classes = alerts[0].getAttribute('class').split(/\s+/);
  for (const required of ['ui-status', 'ui-status-error', 'wrap']) {
    assert.ok(classes.includes(required), `the cart failure uses ${required}`);
  }
  assert.equal(alerts[0].getAttribute('aria-live'), 'assertive');
  assert.ok(alerts[0].textContent.includes('Your saved Cart could not be loaded.'), 'the wording reaches the shopper');
  assert.ok([...alerts[0].querySelectorAll('button')].some(button => button.textContent === 'Retry saved Cart'), 'the failure keeps its action');
  assert.equal(alerts[0].closest('.cart-recovery'), null, 'the recovery notice must not swallow the panel');

  // The transient states were already polite and stay that way; the panel did not replace them.
  const loading = render(cart({ status: 'loading' }));
  assert.equal(loading.querySelectorAll('[role="alert"]').length, 0);
  assert.ok([...loading.querySelectorAll('[role="status"]')].some(node => node.textContent === 'Loading your Cart…'));
});

test('C1 loading the address book is a status panel, and nothing else speaks', async () => {
  const { AddressManager } = await load('/src/features/addresses/AddressManager.tsx');
  const { AuthContext } = await load('/src/features/auth/AuthContext.ts');
  const pending = gate({ data: null, error: null });
  globalThis.__statusTestClient = clientStub({ result: pending.promise });
  await mount(React.createElement(AuthContext.Provider, { value: authValue() }, React.createElement(AddressManager)));

  const panel = find('.ui-status-loading.address-manager');
  assert.ok(panel, 'the address manager renders the shared loading panel');
  assert.equal(panel.getAttribute('role'), 'status');
  assert.equal(panel.getAttribute('aria-live'), 'polite');
  assert.equal(panel.textContent.trim(), 'Loading addresses…');
  assert.equal(announced().length, 1, 'loading the address book is exactly one announcement');
  assert.equal(find('[role="alert"]'), null);
});

test('C2 a saved-address write marks the surface busy without adding a second announcement', async () => {
  const { AddressManager } = await load('/src/features/addresses/AddressManager.tsx');
  const { AuthContext } = await load('/src/features/auth/AuthContext.ts');
  const address = { id: 'addr-2', customer_id: user.id, label: 'Work', street_address: '1 Waterloo Road', area: 'Waterloo', city: 'Freetown', zone_id: 'zone-2', is_default: false, created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z' };
  const write = gate({ data: null, error: null });
  globalThis.__statusTestClient = clientStub({
    result: { data: [address], error: null },
    rpc: (name) => (name === 'set_default_address' ? write.promise : Promise.resolve({ data: null, error: null })),
  });
  await mount(React.createElement(AuthContext.Provider, { value: authValue() }, React.createElement(AddressManager)));

  const surface = find('.address-manager');
  assert.equal(surface.getAttribute('aria-busy'), null, 'an idle address book is not busy');
  const politeBefore = announced().length;

  await act(async () => { find('.set-default-btn').click(); });
  assert.equal(surface.getAttribute('aria-busy'), 'true', 'the surface says a write is in flight');
  assert.equal(announced().length, politeBefore, 'a pending write must not add a live region of its own');
  assert.equal(find('[role="alert"]'), null, 'pending is not a failure');

  await act(async () => { write.settle(); });
  assert.equal(surface.getAttribute('aria-busy'), null, 'the busy flag clears when the write answers');
});

test('C1 the address form names the work it is waiting for', async () => {
  const { AddressForm } = await load('/src/features/addresses/AddressForm.tsx');
  const noop = () => {};
  await mount(React.createElement(AddressForm, { onSubmit: noop, onCancel: noop }));
  assert.equal(find('.save-btn').textContent, 'Save');
  assert.equal(find('.save-btn').disabled, false);

  await mount(React.createElement(AddressForm, { busy: true, onSubmit: noop, onCancel: noop }));
  const save = find('.save-btn');
  assert.equal(save.textContent, 'Saving…', 'a queued save reads as a queued save, as checkout and profile already do');
  assert.equal(save.disabled, true);
  assert.equal(find('form').getAttribute('aria-busy'), 'true');
});

test('C2 order history marks itself busy while the list is in flight', async () => {
  const { MyOrdersPage } = await load('/src/features/orders/OrderPages.tsx');
  const { AuthContext } = await load('/src/features/auth/AuthContext.ts');
  const pending = gate({ data: null, error: null });
  globalThis.__statusTestClient = clientStub({ result: pending.promise });
  await mount(React.createElement(AuthContext.Provider, { value: authValue() }, React.createElement(MyOrdersPage)));

  assert.equal(find('.orders-page').getAttribute('aria-busy'), 'true');
  const speaking = announced();
  assert.equal(speaking.length, 1, 'loading is one announcement');
  assert.equal(speaking[0].getAttribute('role'), 'status');
  assert.equal(speaking[0].textContent, 'Loading your orders…');
  assert.equal(find('[role="alert"]'), null);
  await act(async () => { pending.settle(); });
});

test('C1 a failed order load keeps its exact wording and becomes the only alert', async () => {
  const { MyOrdersPage } = await load('/src/features/orders/OrderPages.tsx');
  const { AuthContext } = await load('/src/features/auth/AuthContext.ts');
  globalThis.__statusTestClient = clientStub({ result: { data: null, error: { message: 'synthetic' } } });
  await mount(React.createElement(AuthContext.Provider, { value: authValue() }, React.createElement(MyOrdersPage)));

  const alert = find('.ui-status-error');
  assert.equal(all('[role="alert"]').length, 1, 'one failed load is announced once');
  assert.equal(alert.getAttribute('role'), 'alert');
  assert.equal(alert.getAttribute('aria-live'), 'assertive');
  assert.equal(alert.querySelector('.ui-status-copy').textContent, 'Your orders could not be loaded. Please retry.', 'Slice C unifies presentation, not copy');
  assert.equal(alert.querySelector('button').textContent, 'Retry');
  assert.equal(find('.orders-page').getAttribute('aria-busy'), null, 'a settled request is no longer busy');
  assert.equal(find('.ui-status-empty'), null, 'a failure must not also read as an empty order history');
  assert.equal(all('.order-history > li').length, 0, 'no stale rows sit beside the failure');
});

test('C1 an account without orders is a quiet empty panel, not an alert', async () => {
  const { MyOrdersPage } = await load('/src/features/orders/OrderPages.tsx');
  const { AuthContext } = await load('/src/features/auth/AuthContext.ts');
  globalThis.__statusTestClient = clientStub();
  await mount(React.createElement(AuthContext.Provider, { value: authValue() }, React.createElement(MyOrdersPage)));

  const empty = find('.ui-status-empty');
  assert.equal(empty.getAttribute('role'), 'status');
  assert.equal(empty.getAttribute('aria-live'), 'polite');
  assert.ok(empty.textContent.includes('You haven’t placed an order yet.'));
  assert.ok(empty.querySelector('a[href="/"]'), 'the empty state keeps its way forward');
  assert.equal(all('[role="alert"]').length, 0, 'nothing went wrong');
  assert.equal(find('.orders-page').getAttribute('aria-busy'), null);
});

test('C1 an order that is not on the account reads as unavailable, not as a failure', async () => {
  const { OrderDetailPage } = await load('/src/features/orders/OrderPages.tsx');
  const { AuthContext } = await load('/src/features/auth/AuthContext.ts');
  globalThis.__statusTestClient = clientStub();
  await mount(
    React.createElement(AuthContext.Provider, { value: authValue() }, React.createElement(OrderDetailPage)),
    { path: '/account/orders/missing', route: '/account/orders/:orderId' }
  );

  const empty = find('.ui-status-empty');
  assert.equal(empty.textContent.trim(), 'This order is unavailable for your account.');
  assert.equal(empty.getAttribute('role'), 'status');
  assert.equal(all('[role="alert"]').length, 0);
  assert.equal(find('.order-page').getAttribute('aria-busy'), null);
});

test('C2 marking a notification read marks the inbox busy without announcing a second time', async () => {
  const { NotificationInbox } = await load('/src/features/notifications/NotificationInbox.tsx');
  const { AuthContext } = await load('/src/features/auth/AuthContext.ts');
  const notification = {
    id: 'note-1', order_id: 'order-1', event_type: 'order_placed', title: 'Order placed',
    message: 'Your order is awaiting payment confirmation.', is_read: false,
    created_at: '2026-11-18T09:00:00.000Z', read_at: null,
  };
  const write = gate({ data: null, error: null });
  globalThis.__statusTestClient = clientStub({
    result: { data: [notification], error: null },
    rpc: (name) => (name === 'mark_notification_read' ? write.promise : Promise.resolve({ data: null, error: null })),
  });
  await mount(React.createElement(AuthContext.Provider, { value: authValue() }, React.createElement(NotificationInbox)));

  const section = find('section.motion-enter');
  assert.equal(section.getAttribute('aria-busy'), null, 'an idle inbox is not busy');
  const speaking = announced().length;

  await act(async () => { find('.notification-toggle-read').click(); });
  assert.equal(section.getAttribute('aria-busy'), 'true', 'the inbox says a read state is in flight');
  assert.equal(all('[role="alert"]').length, 0, 'pending is not a failure');
  assert.equal(announced().length, speaking, 'the pending write adds no announcement of its own');

  await act(async () => { write.settle(); });
  assert.equal(section.getAttribute('aria-busy'), null);
});
