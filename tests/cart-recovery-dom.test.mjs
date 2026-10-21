import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { act, useEffect } from "react";
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
let server, root, CartProvider, ShopPage, ProductDetails, CartPage, Layout, AuthContext, ProductContext, NotificationProvider, classifyCartFailure, useCart;

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
  ({ classifyCartFailure } = await server.ssrLoadModule("/src/features/cart/variantCartRepository.ts"));
  ({ useCart } = await server.ssrLoadModule("/src/features/cart/CartContext.ts"));
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null; host.replaceChildren(); sessionStorage.clear(); delete globalThis.__bagClient; delete dom.window.__cart;
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
function layoutTree(auth, path = "/", page, catalogValue = catalog) {
  const element = page ?? (path === "/cart" ? CartPage : ShopPage);
  return React.createElement(MemoryRouter, { initialEntries: [path] },
    React.createElement(AuthContext.Provider, { value: auth },
      React.createElement(ProductContext.Provider, { value: catalogValue },
        React.createElement(CartProvider, null,
          React.createElement(NotificationProvider, null,
            React.createElement(CartProbe, null),
            React.createElement(Routes, null,
              React.createElement(Route, { element: React.createElement(Layout) },
                React.createElement(Route, { path, element: React.isValidElement(element) ? element : React.createElement(element) }))))))));
}

/**
 * The published Bag context, so a test can start a change and a refresh in the
 * same event turn, the way a customer can act before React commits the next
 * render.
 */
function CartProbe() {
  const cart = useCart();
  useEffect(() => { dom.window.__cart = cart; }, [cart]);
  return null;
}

/** A catalogue state with a new identity, which re-reads the saved Bag. */
function nextCatalog() {
  return { state: { status: "ready", products: [product] }, refresh() {} };
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

test("the recovery control can be retried after a failed reconciliation", async () => {
  const change = deferred();
  let loads = 0;
  const calls = bagClient(name => {
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
  assert.match(host.querySelector(".cart-recovery").textContent, /couldn't refresh your saved Bag/);
  const loadsBefore = loads;
  // The control is offered again after the failed reconciliation.
  await click(button("Refresh saved Bag"));
  await flush();
  assert.equal(loads, loadsBefore + 1, "the recovery control can be retried after a failed reconciliation");
  // The failed reconciliation still keeps the Bag locked for changes.
  const outcome = await dom.window.__cart.dispatch({ type: "add", productId: "fixture-mug", variantId: "v-default" });
  assert.equal(outcome.kind, "superseded", "a change stays blocked until the saved Bag is reconciled");
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1, "the blocked change never reaches the server");
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
  assert.doesNotMatch(host.textContent, /Bag\(4\)/, "a stale response must not update the new customer's Bag");
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

test("only a failure that is known to have rolled back is a definite refusal", () => {
  const table = [
    // The completion of the statement or the transaction is unknown.
    ["08007", "uncertain"],
    ["40003", "uncertain"],
    ["08006", "uncertain"],
    ["08003", "uncertain"],
    ["57P01", "uncertain"],
    ["PGRST116", "uncertain"],
    ["", "uncertain"],
    // The statement was refused and the transaction was rolled back.
    ["23505", "rejected"],
    ["23503", "rejected"],
    ["23514", "rejected"],
    ["22003", "rejected"],
    ["42P01", "rejected"],
    // A raise the trusted function did not name is not a known refusal.
    ["P0001", "uncertain"],
    // The trusted function never ran.
    ["PGRST202", "schema_not_ready"],
  ];
  for (const [code, expected] of table) {
    assert.equal(classifyCartFailure({ code, message: "fixture" }), expected, `SQLSTATE ${code || "(none)"}`);
  }
  assert.equal(classifyCartFailure({ code: "P0001", message: "CART_CHANGED" }), "cart_changed");
  assert.equal(classifyCartFailure({ code: "P0001", message: "PRODUCT_UNAVAILABLE" }), "rejected");
});

test("a failure whose completion is unknown is never reported as a definite refusal", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settle(change, { data: null, error: { code: "08007", message: "could not receive response from the server" } });
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /couldn't confirm adding Fixture mug to your Bag/);
  assert.doesNotMatch(toast.textContent, /08007|could not receive response/, "no raw server detail reaches the customer");
  assert.ok(host.querySelector(".cart-recovery"), "an unknown completion can leave the saved Bag out of date");
});

test("a failure that rolled back asks for no reconciliation the customer does not need", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settle(change, { data: null, error: { code: "23505", message: "fixture failure" } });
  assert.match(host.querySelector(".bag-notice").textContent, /couldn't add Fixture mug to your Bag/);
  assert.equal(host.querySelectorAll(".cart-recovery").length, 0, "a rolled back refusal leaves the saved Bag unchanged");
});

test("a change started in the same turn as a saved Bag refresh never runs beside it", async () => {
  const change = deferred();
  const load = deferred();
  let loads = 0;
  const calls = bagClient(name => {
    if (name === "load_variant_cart") { loads += 1; return loads === 1 ? emptyCart() : load.promise; }
    return change.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  assert.ok(host.querySelector(".cart-recovery"), "the unconfirmed change asks for reconciliation");
  // The customer refreshes the saved Bag and acts again before React commits
  // the next render.
  await act(async () => {
    dom.window.__cart.refreshSavedCart();
    await dom.window.__cart.dispatch({ type: "add", productId: "fixture-mug", variantId: "v-default" });
    await Promise.resolve();
  });
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1, "the second change never reaches the server beside the refresh");
  assert.equal(calls.filter(call => call.name === "load_variant_cart").length, 2, "the saved Bag is re-read once");
  await settle(load, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  await flush();
  assert.match(host.textContent, /Bag\(1\)/, "the refreshed saved Bag is what the customer sees");
  assert.match(host.querySelector(".cart-recovery").textContent, /Your saved Bag is up to date/);
});

test("a removal started in the same turn as a saved Bag refresh keeps the saved line", async () => {
  const change = deferred();
  const load = deferred();
  let loads = 0;
  const calls = bagClient(name => {
    if (name === "load_variant_cart") {
      loads += 1;
      return loads === 1
        ? Promise.resolve({ data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null })
        : load.promise;
    }
    return change.promise;
  });
  await mount(layoutTree(userAuth, "/cart"));
  await click(buttonByLabel("Remove Fixture mug"));
  await settleError(change, new TypeError("Failed to fetch"));
  assert.ok(host.querySelector(".cart-recovery"), "the unconfirmed removal asks for reconciliation");
  await act(async () => {
    dom.window.__cart.refreshSavedCart();
    await dom.window.__cart.dispatch({ type: "remove", productId: "fixture-mug", variantId: "v-default" });
    await Promise.resolve();
  });
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1, "the second removal never reaches the server beside the refresh");
  await settle(load, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
  await flush();
  assert.ok(buttonByLabel("Remove Fixture mug"), "the saved line is still there");
  assert.match(host.querySelector(".cart-recovery").textContent, /Your saved Bag is up to date/);
});

test("a quantity change started in the same turn as a saved Bag refresh is refused and can be made afterwards", async () => {
  const first = deferred();
  const second = deferred();
  const load = deferred();
  let loads = 0;
  let changes = 0;
  const calls = bagClient(name => {
    if (name === "load_variant_cart") {
      loads += 1;
      return loads === 1
        ? Promise.resolve({ data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null })
        : load.promise;
    }
    changes += 1;
    return changes === 1 ? first.promise : second.promise;
  });
  await mount(layoutTree(userAuth, "/cart"));
  await click(buttonByLabel("Remove Fixture mug"));
  await settleError(first, new TypeError("Failed to fetch"));
  assert.ok(host.querySelector(".cart-recovery"), "the unconfirmed removal asks for reconciliation");
  await act(async () => {
    dom.window.__cart.refreshSavedCart();
    dom.window.__cart.dispatch({ type: "quantity", productId: "fixture-mug", variantId: "v-default", quantity: 5 });
    await Promise.resolve();
  });
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1, "the quantity change never reaches the server beside the refresh");
  await settle(load, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
  await flush();
  assert.equal(host.querySelector('input[type="number"]').value, "2", "the saved quantity is unchanged");
  // Once the reconciliation has settled the customer can change the quantity.
  await act(async () => {
    dom.window.__cart.dispatch({ type: "quantity", productId: "fixture-mug", variantId: "v-default", quantity: 3 });
    await Promise.resolve();
  });
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 2, "the later change is sent");
  const operationIds = calls.filter(call => call.name === "change_variant_cart").map(call => call.args.p_operation_id);
  assert.equal(new Set(operationIds).size, 2, "each explicit change carries its own operation id");
  await settle(second, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 3 }] }, error: null });
  await flush();
  assert.equal(host.querySelector('input[type="number"]').value, "3", "the confirmed quantity is shown");
});

test("a saved Bag refresh that crosses an identity change never reaches the next customer", async () => {
  const change = deferred();
  const load = deferred();
  let loads = 0;
  bagClient(name => {
    if (name === "load_variant_cart") { loads += 1; return loads === 1 ? emptyCart() : load.promise; }
    return change.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  await act(async () => {
    dom.window.__cart.refreshSavedCart();
    root.render(layoutTree(guestAuth));
    await Promise.resolve();
  });
  await settle(load, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 4 }] }, error: null });
  await flush();
  assert.equal(host.querySelectorAll(".cart-recovery").length, 0, "the recovery belonged to the previous session");
  assert.doesNotMatch(host.textContent, /Bag\(4\)/, "the previous session's saved Bag never reaches the next customer");
});

test("two saved Bag refreshes started in the same turn re-read the saved Bag once", async () => {
  const change = deferred();
  const load = deferred();
  let loads = 0;
  const calls = bagClient(name => {
    if (name === "load_variant_cart") { loads += 1; return loads === 1 ? emptyCart() : load.promise; }
    return change.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  await act(async () => {
    dom.window.__cart.refreshSavedCart();
    dom.window.__cart.refreshSavedCart();
    await Promise.resolve();
  });
  assert.equal(calls.filter(call => call.name === "load_variant_cart").length, 2, "the saved Bag is re-read once");
  await settle(load, { data: { id: "cart-1", items: [] }, error: null });
  await flush();
  assert.match(host.querySelector(".cart-recovery").textContent, /Your saved Bag is up to date/);
});

test("a saved Bag read that fails after a newer confirmed change never reopens the recovery", async () => {
  const first = deferred();
  const second = deferred();
  const load = deferred();
  let loads = 0;
  let changes = 0;
  bagClient(name => {
    if (name === "load_variant_cart") { loads += 1; return loads === 1 ? emptyCart() : load.promise; }
    changes += 1;
    return changes === 1 ? first.promise : second.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(first, new TypeError("Failed to fetch"));
  assert.ok(host.querySelector(".cart-recovery"), "the unconfirmed change asks for reconciliation");
  await act(async () => {
    dom.window.__cart.dispatch({ type: "add", productId: "fixture-mug", variantId: "v-default" });
    await Promise.resolve();
  });
  // A catalogue refresh re-reads the saved Bag while the change is still in
  // flight, so the read can answer with a snapshot from before the change.
  await rerender(layoutTree(userAuth, "/", undefined, nextCatalog()));
  await settle(second, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  await flush();
  const recoveryAfterChange = host.querySelectorAll(".cart-recovery").length;
  // The overlapping read then fails.
  await settleError(load, { code: "57014", message: "statement timeout" });
  await flush();
  assert.equal(recoveryAfterChange, 0, "the confirmed change supersedes the recovery");
  assert.equal(host.querySelectorAll(".cart-recovery").length, 0, "the superseded read never reopens the recovery");
  assert.equal(host.querySelectorAll('[role="alert"]').length, 0, "the superseded read never claims the saved Bag is broken");
  assert.match(host.textContent, /Bag\(1\)/, "the confirmed change is still the customer's saved Bag");
});

test("a saved Bag read that overlaps a newer confirmed change never overwrites it", async () => {
  const change = deferred();
  const load = deferred();
  let loads = 0;
  bagClient(name => {
    if (name === "load_variant_cart") { loads += 1; return loads === 1 ? emptyCart() : load.promise; }
    return change.promise;
  });
  await mount(layoutTree(userAuth));
  await act(async () => {
    dom.window.__cart.dispatch({ type: "add", productId: "fixture-mug", variantId: "v-default" });
    await Promise.resolve();
  });
  await rerender(layoutTree(userAuth, "/", undefined, nextCatalog()));
  await settle(change, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  await flush();
  assert.match(host.textContent, /Bag\(1\)/, "the confirmed change is visible");
  // The overlapping read answers afterwards with the snapshot from before the
  // change was applied.
  await settle(load, { data: { id: "cart-1", items: [] }, error: null });
  await flush();
  assert.match(host.textContent, /Bag\(1\)/, "the older read never overwrites the newer confirmed change");
});

test("a confirmed change supersedes a pending saved Bag recovery", async () => {
  const first = deferred();
  const second = deferred();
  let changes = 0;
  const calls = bagClient(name => {
    if (name === "load_variant_cart") return emptyCart();
    changes += 1;
    return changes === 1 ? first.promise : second.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(first, new TypeError("Failed to fetch"));
  assert.ok(host.querySelector(".cart-recovery"), "the unconfirmed change asks for reconciliation");
  await act(async () => {
    dom.window.__cart.dispatch({ type: "add", productId: "fixture-mug", variantId: "v-default" });
    await Promise.resolve();
  });
  await settle(second, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  await flush();
  assert.equal(host.querySelectorAll(".cart-recovery").length, 0, "the confirmed change clears the pending recovery");
  assert.match(host.textContent, /Bag\(1\)/);
  const operationIds = calls.filter(call => call.name === "change_variant_cart").map(call => call.args.p_operation_id);
  assert.equal(operationIds.length, 2);
  assert.notEqual(operationIds[0], operationIds[1], "the unconfirmed change is never replayed under its own operation id");
});
