import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", pretendToBeVisual: true });
const { document } = dom.window;
for (const name of ["window", "document", "HTMLElement", "Element", "sessionStorage"])
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const host = document.getElementById("root");
let server, root, CartProvider, ShopPage, ProductDetails, CartPage, Layout, AuthContext, ProductContext, NotificationProvider;

const product = {
  id: "fixture-mug", name: "Fixture mug", description: "Fixture description", category: "Fixture category",
  price: 1800, image: "/images/mug.svg", color: "#e9e3d8",
  variants: [{ id: "v-default", productId: "fixture-mug", options: {}, isDefault: true, price: 1800, currency: "NLE", inventoryPolicy: "untracked" }],
};
const catalog = { state: { status: "ready", products: [product] }, refresh() {} };
const guestAuth = { loading: false, session: null, error: null, signIn: async () => {}, signOut: async () => {} };
const userAuth = { loading: false, session: { user: { id: "user-1" }, access_token: "synthetic-test-jwt" }, error: null, signIn: async () => {}, signOut: async () => {} };

before(async () => {
  server = await createServer({
    configFile: false, envDir: false, server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: "isolated-recovery-client", enforce: "pre",
      load(id) {
        if (id.replaceAll("\\", "/").endsWith("/src/lib/supabase/client.ts"))
          return "export function getSupabaseClient(){return globalThis.__bagClient;}";
      },
    }],
  });
  ({ CartProvider } = await server.ssrLoadModule("/src/features/cart/CartProvider.tsx"));
  ({ ShopPage } = await server.ssrLoadModule("/src/features/products/ShopPage.tsx"));
  ({ ProductDetails } = await server.ssrLoadModule("/src/features/products/ProductDetailsPage.tsx"));
  ({ CartPage } = await server.ssrLoadModule("/src/features/cart/CartPage.tsx"));
  ({ Layout } = await server.ssrLoadModule("/src/components/Layout.tsx"));
  ({ AuthContext } = await server.ssrLoadModule("/src/features/auth/AuthContext.ts"));
  ({ ProductContext } = await server.ssrLoadModule("/src/features/products/ProductContext.ts"));
  ({ NotificationProvider } = await server.ssrLoadModule("/src/components/NotificationProvider.tsx"));
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null; host.replaceChildren(); sessionStorage.clear(); delete globalThis.__bagClient;
});
after(async () => { await server.close(); dom.window.close(); });

function bagClient(handler) {
  const calls = [];
  globalThis.__bagClient = {
    rpc(name, args) {
      calls.push({ name, args });
      const outcome = handler(name, args);
      return { setHeader() { return outcome; } };
    },
  };
  return calls;
}
const emptyCart = () => Promise.resolve({ data: { id: "cart-1", items: [] }, error: null });
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const button = text => [...host.querySelectorAll("button")].find(item => item.textContent === text || item.getAttribute("aria-label") === text);
const buttonByLabel = label => host.querySelector(`button[aria-label="${label}"]`);
async function mount(element) {
  root = createRoot(host);
  await act(async () => { root.render(element); await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function click(element) {
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
}
async function settle(change, value) {
  await act(async () => { change.resolve(value); await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function settleError(change, reason) {
  await act(async () => { change.reject(reason); await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function rerender(element) {
  await act(async () => { root.render(element); await new Promise(resolve => setTimeout(resolve, 0)); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
function layoutTree(auth, path = "/", page) {
  const element = page ?? (path === "/cart" ? CartPage : ShopPage);
  return React.createElement(MemoryRouter, { initialEntries: [path] },
    React.createElement(AuthContext.Provider, { value: auth },
      React.createElement(ProductContext.Provider, { value: catalog },
        React.createElement(CartProvider, null,
          React.createElement(NotificationProvider, null,
            React.createElement(Routes, null,
              React.createElement(Route, { element: React.createElement(Layout) },
                React.createElement(Route, { path, element: React.isValidElement(element) ? element : React.createElement(element) }))))))));
}

test("a stale Bag response keeps its specific guidance and offers an in-app saved Bag refresh", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settle(change, { data: null, error: { code: "P0001", message: "CART_CHANGED" } });
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /Your Bag changed in another session/);
  assert.match(toast.textContent, /Refresh your saved Bag to see the current items/);
  assert.equal(
    host.querySelectorAll('.bag-notice-region[aria-live="assertive"] .bag-notice').length,
    1,
    "the action failure is announced exactly once",
  );
  assert.equal(host.querySelector('[role="alert"]'), null, "no duplicate global failure announcement");
  const recovery = host.querySelector(".cart-recovery");
  assert.ok(recovery, "a persistent recovery control is offered");
  assert.match(recovery.textContent, /Your Bag changed in another session/);
  assert.equal(recovery.querySelector('[role="alert"]'), null, "the persistent control never announces again");
  assert.equal(recovery.querySelector('[role="status"]'), null, "the persistent control never announces again");
  const refresh = recovery.querySelector("button");
  assert.equal(refresh.textContent, "Refresh saved Bag");
  assert.equal(refresh.type, "button");
  assert.equal(refresh.disabled, false);
});

test("a rejected change is announced once and never duplicates the global Bag error", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settle(change, { data: null, error: { code: "23505", message: "fixture failure" } });
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /couldn't add Fixture mug to your Bag/);
  assert.doesNotMatch(toast.textContent, /CART_CHANGED|23505|P0001/, "no raw server codes reach the customer");
  assert.equal(host.querySelectorAll('.bag-notice-region[aria-live="assertive"] .bag-notice').length, 1);
  assert.equal(host.querySelector('[role="alert"]'), null);
});

test("a schema-not-ready failure keeps its guidance and never offers a refresh it cannot satisfy", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settle(change, { data: null, error: { code: "PGRST202", message: "Could not find the function" } });
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /still being updated/);
  assert.match(toast.textContent, /try again shortly/);
  assert.doesNotMatch(toast.textContent, /PGRST202|schema/i, "no raw server codes reach the customer");
  assert.equal(host.querySelector(".cart-recovery"), null, "a missing trusted function cannot be reconciled by a refresh");
  assert.equal(host.querySelector('[role="alert"]'), null);
});

test("an unconfirmed change stays unconfirmed and offers reconciliation", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /couldn't confirm adding Fixture mug to your Bag/);
  assert.doesNotMatch(toast.textContent, /was not added|not saved|failed to fetch|TypeError/i);
  assert.ok(host.querySelector(".cart-recovery"), "an unconfirmed change can leave the saved Bag out of date");
});

test("a removal rejection has exactly one assertive announcement and offers reconciliation", async () => {
  const change = deferred();
  bagClient(name => {
    if (name === "load_variant_cart")
      return Promise.resolve({ data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
    return change.promise;
  });
  await mount(layoutTree(userAuth, "/cart"));
  await click(buttonByLabel("Remove Fixture mug"));
  await settleError(change, new TypeError("Failed to fetch"));
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /couldn't confirm removing Fixture mug from your Bag/);
  assert.equal(host.querySelectorAll('.bag-notice-region[aria-live="assertive"] .bag-notice').length, 1);
  assert.equal(host.querySelector('[role="alert"]'), null);
  assert.ok(host.querySelector(".cart-recovery"));
});

test("the recovery action re-reads the saved Bag without repeating the unconfirmed change", async () => {
  const change = deferred();
  const calls = bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  const refresh = button("Refresh saved Bag");
  assert.ok(refresh);
  await act(async () => { refresh.focus(); });
  assert.equal(document.activeElement, refresh, "the recovery action is keyboard reachable");
  await click(refresh);
  await flush();
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1, "the unconfirmed change is never replayed");
  assert.equal(calls.filter(call => call.name === "load_variant_cart").length, 2, "the saved Bag is re-read");
  const recovery = host.querySelector(".cart-recovery");
  assert.match(recovery.textContent, /Your saved Bag is up to date/);
  assert.match(recovery.textContent, /Review the items and quantities/);
});

test("the recovery action is available on Product Details as well as the Shop", async () => {
  const change = deferred();
  const calls = bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth, "/products/fixture-mug", React.createElement(ProductDetails, { product })));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  const refresh = button("Refresh saved Bag");
  assert.ok(refresh, "the recovery control is not limited to the Bag page");
  await click(refresh);
  await flush();
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1);
  assert.equal(calls.filter(call => call.name === "load_variant_cart").length, 2);
  assert.match(host.querySelector(".cart-recovery").textContent, /Your saved Bag is up to date/);
});

test("a failed refresh keeps the guidance truthful and never claims reconciliation", async () => {
  const change = deferred();
  let loads = 0;
  bagClient(name => {
    if (name === "load_variant_cart") {
      loads += 1;
      return loads === 1 ? emptyCart() : Promise.resolve({ data: null, error: { code: "57014", message: "statement timeout" } });
    }
    return change.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  await click(button("Refresh saved Bag"));
  await flush();
  assert.doesNotMatch(host.textContent, /Your saved Bag is up to date/, "a failed refresh never claims reconciliation");
  const recovery = host.querySelector(".cart-recovery");
  assert.match(recovery.textContent, /couldn't refresh your saved Bag/);
  assert.equal(recovery.querySelector('[role="alert"]'), null, "the persistent control does not duplicate the announcement");
  const alert = host.querySelector('[role="alert"]');
  assert.ok(alert, "the global restore error keeps its own announcement");
  assert.match(alert.textContent, /Retry saved Bag/);
});

test("repeated refresh activation is guarded and cannot overlap restores", async () => {
  const change = deferred();
  const load = deferred();
  let loads = 0;
  const calls = bagClient(name => {
    if (name === "load_variant_cart") {
      loads += 1;
      return loads === 1 ? emptyCart() : load.promise;
    }
    return change.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  const refresh = button("Refresh saved Bag");
  await click(refresh);
  await click(refresh);
  await flush();
  assert.equal(calls.filter(call => call.name === "load_variant_cart").length, 2, "the overlapping refresh is ignored");
  assert.equal(host.querySelector(".cart-recovery").getAttribute("aria-busy"), "true");
  await settle(load, { data: { id: "cart-1", items: [] }, error: null });
  await flush();
  assert.match(host.querySelector(".cart-recovery").textContent, /Your saved Bag is up to date/);
});

test("a stale session result cannot reconcile a different customer's Bag", async () => {
  const change = deferred();
  const load = deferred();
  let loads = 0;
  bagClient(name => {
    if (name === "load_variant_cart") {
      loads += 1;
      return loads === 1 ? emptyCart() : load.promise;
    }
    return change.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  await click(button("Refresh saved Bag"));
  await flush();
  await rerender(layoutTree(guestAuth));
  await settle(load, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 4 }] }, error: null });
  await flush();
  assert.equal(host.querySelector(".cart-recovery"), null, "the recovery request belonged to the previous session");
  assert.doesNotMatch(host.textContent, /Bag \(4\)/, "a stale response must not update the new customer's Bag");
});

test("a saved Bag refresh keeps the guest merge receipt and never replays the unconfirmed change", async () => {
  sessionStorage.setItem("lume-guest-cart", JSON.stringify({
    version: 2,
    items: [{ productId: "fixture-mug", variantId: "v-default", quantity: 2, mergeId: "11111111-1111-4111-8111-111111111111" }],
  }));
  const change = deferred();
  const calls = bagClient((name, args) => {
    if (name === "load_variant_cart") return emptyCart();
    if (args && args.p_mode === "merge") return Promise.resolve({ data: { id: "cart-1", items: [] }, error: null });
    return change.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  await click(button("Refresh saved Bag"));
  await flush();
  const merges = calls.filter(call => call.args && call.args.p_mode === "merge");
  assert.equal(merges.length, 1, "guest intent is merged once, not on every refresh");
  assert.equal(merges[0].args.p_operation_id, "11111111-1111-4111-8111-111111111111", "the guest merge receipt is reused");
  const adds = calls.filter(call => call.args && call.args.p_mode === "add");
  assert.equal(adds.length, 1, "the unconfirmed add is never replayed");
});

test("the recovery control outlives the notification it belongs to", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  await click(host.querySelector(".bag-notice-dismiss"));
  assert.equal(host.querySelector(".bag-notice"), null, "the transient notification is gone");
  const recovery = host.querySelector(".cart-recovery");
  assert.ok(recovery, "the recovery control does not depend on the notification timer");
  const refresh = recovery.querySelector("button");
  assert.equal(refresh.disabled, false);
  await act(async () => { refresh.focus(); });
  assert.equal(document.activeElement, refresh, "the recovery action stays keyboard reachable");
});

test("a quantity failure keeps its own global recovery and never opens the saved Bag recovery", async () => {
  const change = deferred();
  bagClient(name => {
    if (name === "load_variant_cart")
      return Promise.resolve({ data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
    return change.promise;
  });
  await mount(layoutTree(userAuth, "/cart"));
  const input = host.querySelector('input[type="number"]');
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, "3");
  await act(async () => { input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  await settle(change, { data: null, error: { code: "P0001", message: "fixture quantity failure" } });
  assert.equal(host.querySelector(".bag-notice"), null);
  assert.equal(host.querySelector(".cart-recovery"), null);
  const alert = host.querySelector('[role="alert"]');
  assert.ok(alert);
  assert.match(alert.textContent, /Retry saved Bag/);
});
