import assert from 'node:assert/strict';
import {after, afterEach, before, test} from 'node:test';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {createMemoryRouter, RouterProvider} from 'react-router-dom';

// Isolated component/query evidence. No hosted endpoint, Auth identity or credentials.
const dom = new JSDOM('<!doctype html><div id="root"></div>', {url: 'http://localhost/'});
const {document} = dom.window;
for (const name of ['window', 'document', 'HTMLElement', 'Element']) Object.defineProperty(globalThis, name, {configurable: true, value: dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {createRoot} = await import('react-dom/client');
const host = document.getElementById('root');
let server, root, router, ProductProvider, useProducts;
before(async () => {
  server = await createServer({configFile: false, envDir: false, server: {middlewareMode: true, hmr: false}, plugins: [{name: 'isolated-catalog-client', enforce: 'pre', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/src/lib/supabase/client.ts')) return 'export function getSupabaseClient(){return globalThis.__catalogClient;}';
  }}]});
  ({ProductProvider} = await server.ssrLoadModule('/src/features/products/ProductProvider.tsx'));
  ({useProducts} = await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
});
afterEach(async () => {if (root) await act(async () => root.unmount()); root = undefined; router?.dispose(); router = undefined; delete globalThis.__catalogClient; host.replaceChildren();});
after(async () => {await server.close(); dom.window.close();});

function deferred() {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};}
function catalogue(name = 'Original piece', price = 100, available = true) {
  return {
    products: [{id: 'local-piece', name, description: 'Local query fixture', category: 'Home', image_path: '/images/mug.svg', background_color: '#e9e3d8', price_cents: price, currency: 'NLE', active: true}],
    variants: [{id: 'local-variant', product_id: 'local-piece', options: {}, is_default: true, price_cents: price, currency: 'NLE', active: true, inventory_policy: 'tracked'}],
    availability: [{variant_id: 'local-variant', available}],
  };
}
function clientFor(initial) {
  const model = {snapshot: initial, reads: [], pending: null, fail: false};
  globalThis.__catalogClient = {
    from(table) {
      const query = {select() {return query;}, eq() {return query;}, order() {return query;}, abortSignal(signal) {
        model.reads.push({table, signal});
        if (table === 'products' && model.pending) {const pending = model.pending; model.pending = null; return pending.promise;}
        return Promise.resolve({data: table === 'products' ? model.snapshot.products : model.snapshot.variants, error: model.fail ? {message: 'PRIVATE provider detail'} : null});
      }};
      return query;
    },
    rpc(name) {
      assert.equal(name, 'catalogue_variant_availability');
      return {abortSignal(signal) {model.reads.push({table: 'public-availability', signal}); return Promise.resolve({data: model.snapshot.availability, error: null});}};
    },
  };
  return model;
}
function Probe() {const {state, refresh} = useProducts(); return React.createElement(React.Fragment, null, React.createElement('output', null, JSON.stringify(state)), React.createElement('button', {onClick: refresh}, 'Retry'));}
async function mount(path = '/') {
  router = createMemoryRouter([{path: '*', element: React.createElement(ProductProvider, null, React.createElement(Probe))}], {initialEntries: [path]});
  root = createRoot(host); await act(async () => root.render(React.createElement(RouterProvider, {router})));
}
function state() {return JSON.parse(host.querySelector('output').textContent);}
async function navigate(path) {await act(async () => router.navigate(path));}
async function retry() {await act(async () => host.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true})));}

test('same-tab return from admin revalidates public names, variant prices and stock availability without customer-route polling', async () => {
  const model = clientFor(catalogue()); await mount();
  assert.equal(state().products[0].name, 'Original piece'); assert.equal(model.reads.length, 3);
  await navigate('/help'); await navigate('/products/local-piece'); assert.equal(model.reads.length, 3);
  await navigate('/admin/products'); await navigate('/admin/inventory'); assert.equal(model.reads.length, 3);
  model.snapshot = catalogue('Updated piece', 250, false);
  await navigate('/');
  assert.equal(state().products[0].name, 'Updated piece'); assert.equal(state().products[0].price, 250); assert.equal(state().products[0].variants[0].available, false);
  assert.equal(model.reads.length, 6);
  assert.doesNotMatch(host.textContent, /on_hand|allocated|sku|PRIVATE/);
});

test('archive or variant visibility changes replace the prior public catalogue, including empty results', async () => {
  const model = clientFor(catalogue()); await mount(); await navigate('/admin/products');
  model.snapshot = {products: [], variants: [], availability: []}; await navigate('/');
  assert.deepEqual(state(), {status: 'ready', products: []}); assert.doesNotMatch(host.textContent, /Original piece/);
});

test('an aborted prior read cannot overwrite the catalogue returned after an admin visit', async () => {
  const model = clientFor(catalogue()); const pending = deferred(); model.pending = pending; await mount();
  const obsolete = model.reads[0]; assert.equal(state().status, 'loading'); await navigate('/admin/orders'); assert.equal(obsolete.signal.aborted, true);
  model.snapshot = catalogue('Current piece', 300); await navigate('/'); assert.equal(state().products[0].name, 'Current piece');
  await act(async () => pending.resolve({data: catalogue('Obsolete piece').products, error: null})); assert.equal(state().products[0].name, 'Current piece');
});

test('initial admin visits avoid public requests and failed return revalidation exposes an error with a working explicit retry', async () => {
  const model = clientFor(catalogue()); await mount('/admin/products'); assert.equal(model.reads.length, 0);
  model.fail = true; await navigate('/'); assert.deepEqual(state(), {status: 'error'}); assert.doesNotMatch(host.textContent, /Original piece|PRIVATE/);
  model.fail = false; await retry(); assert.equal(state().products[0].name, 'Original piece');
});
