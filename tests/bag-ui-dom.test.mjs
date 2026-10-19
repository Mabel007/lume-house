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
let server, root, CartProvider, useCart, ShopPage, ProductDetails, CartPage, Layout, AuthContext, ProductContext;

const product = {
  id: "fixture-mug", name: "Fixture mug", description: "Fixture description", category: "Fixture category",
  price: 1800, image: "/images/mug.svg", color: "#e9e3d8",
  variants: [{ id: "v-default", productId: "fixture-mug", options: {}, isDefault: true, price: 1800, currency: "NLE", inventoryPolicy: "untracked" }],
};
const guestAuth = { loading: false, session: null, error: null, signIn: async () => {}, signOut: async () => {} };
const userAuth = { loading: false, session: { user: { id: "user-1" }, access_token: "synthetic-test-jwt" }, error: null, signIn: async () => {}, signOut: async () => {} };
const userAuthB = { loading: false, session: { user: { id: "user-2" }, access_token: "synthetic-test-jwt-b" }, error: null, signIn: async () => {}, signOut: async () => {} };
const productTwo = {
  id: "fixture-vase", name: "Fixture vase", description: "Fixture description", category: "Fixture category",
  price: 2500, image: "/images/mug.svg", color: "#e9e3d8",
  variants: [{ id: "v-vase", productId: "fixture-vase", options: {}, isDefault: true, price: 2500, currency: "NLE", inventoryPolicy: "untracked" }],
};
const catalog = { state: { status: "ready", products: [product] }, refresh() {} };
const recorded = [];

before(async () => {
  server = await createServer({
    configFile: false, envDir: false, server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: "isolated-bag-client", enforce: "pre",
      load(id) {
        if (id.replaceAll("\\", "/").endsWith("/src/lib/supabase/client.ts"))
          return "export function getSupabaseClient(){return globalThis.__bagClient;}";
      },
    }],
  });
  ({ CartProvider } = await server.ssrLoadModule("/src/features/cart/CartProvider.tsx"));
  ({ useCart } = await server.ssrLoadModule("/src/features/cart/CartContext.ts"));
  ({ ShopPage } = await server.ssrLoadModule("/src/features/products/ShopPage.tsx"));
  ({ ProductDetails } = await server.ssrLoadModule("/src/features/products/ProductDetailsPage.tsx"));
  ({ CartPage } = await server.ssrLoadModule("/src/features/cart/CartPage.tsx"));
  ({ Layout } = await server.ssrLoadModule("/src/components/Layout.tsx"));
  ({ AuthContext } = await server.ssrLoadModule("/src/features/auth/AuthContext.ts"));
  ({ ProductContext } = await server.ssrLoadModule("/src/features/products/ProductContext.ts"));
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null; host.replaceChildren(); sessionStorage.clear(); delete globalThis.__bagClient;
  recorded.length = 0;
});
after(async () => { await server.close(); dom.window.close(); });

function bagClient(handler) {
  const calls = [];
  globalThis.__bagClient = {
    rpc(name, args) {
      calls.push({ name, args });
      const outcome = handler(name);
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
const readStored = () => JSON.parse(sessionStorage.getItem("lume-guest-cart") || "null");
const button = text => [...host.querySelectorAll("button")].find(item => item.textContent === text || item.getAttribute("aria-label") === text);
const buttonByLabel = label => host.querySelector(`button[aria-label="${label}"]`);

async function mount(element) {
  root = createRoot(host);
  await act(async () => { root.render(element); await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function click(element) {
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
}
async function settle(deferredChange, value) {
  await act(async () => { deferredChange.resolve(value); await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function settleError(deferredChange, reason) {
  await act(async () => { deferredChange.reject(reason); await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function typeQuantity(input, text) {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, text);
  await act(async () => { input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
}
function withProviders(auth, children, catalogValue = catalog) {
  return React.createElement(MemoryRouter, { initialEntries: ["/"] },
    React.createElement(AuthContext.Provider, { value: auth },
      React.createElement(ProductContext.Provider, { value: catalogValue },
        React.createElement(CartProvider, null, children))));
}
async function rerender(element) {
  await act(async () => { root.render(element); await new Promise(resolve => setTimeout(resolve, 0)); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
function layoutTree(auth, path = "/") {
  return React.createElement(MemoryRouter, { initialEntries: [path] },
    React.createElement(AuthContext.Provider, { value: auth },
      React.createElement(ProductContext.Provider, { value: catalog },
        React.createElement(CartProvider, null,
          React.createElement(Routes, null,
            React.createElement(Route, { element: React.createElement(Layout) },
              React.createElement(Route, { path, element: React.createElement(path === "/cart" ? CartPage : ShopPage) })))))));
}
function DoubleAddProbe() {
  const { items, dispatch } = useCart();
  return React.createElement("div", null,
    React.createElement("button", {
      onClick: () => {
        dispatch({ type: "add", productId: "fixture-mug", variantId: "v-default", quantity: 1 })
          .then(outcome => { recorded.push(outcome.kind); });
        dispatch({ type: "add", productId: "fixture-mug", variantId: "v-default", quantity: 1 })
          .then(outcome => { recorded.push(outcome.kind); });
      },
    }, "double-add"),
    React.createElement("span", { id: "probe-count" }, String(items.reduce((total, item) => total + item.quantity, 0))));
}
function OutcomeProbe() {
  const { dispatch } = useCart();
  return React.createElement("div", null,
    React.createElement("button", {
      onClick: () => {
        dispatch({ type: "add", productId: "fixture-mug", variantId: "v-default", quantity: 1 })
          .then(outcome => { recorded.push(outcome.kind); });
      },
    }, "probe-add"),
    React.createElement("button", {
      onClick: () => {
        dispatch({ type: "add", productId: "fixture-mug", variantId: "v-default", quantity: 0 })
          .then(outcome => { recorded.push(outcome.kind); });
      },
    }, "probe-bad"));
}

test("guest Add to Bag persists locally, relabels the card and never calls RPCs", async () => {
  const calls = bagClient(() => emptyCart());
  await mount(withProviders(guestAuth, React.createElement(ShopPage)));
  const add = buttonByLabel("Add Fixture mug to Bag");
  assert.ok(add);
  assert.match(add.textContent, /Add to Bag/);
  assert.ok(host.querySelector('.bag-notice-region[role="status"][aria-live="polite"]'));
  assert.equal(host.querySelector(".bag-notice"), null);
  assert.deepEqual(readStored().items, []);
  await click(add);
  const stored = readStored();
  assert.equal(stored.version, 2);
  assert.equal(stored.items.length, 1);
  assert.deepEqual(
    stored.items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
    [{ productId: "fixture-mug", variantId: "v-default", quantity: 1 }],
  );
  assert.match(stored.items[0].mergeId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /Added 1 × Fixture mug to your Bag/);
  assert.equal(calls.length, 0);
  const relabeled = buttonByLabel("Add Fixture mug to Bag");
  assert.match(relabeled.textContent, /Add another · 1 in Bag/);
});

test("guest Product Details adds the chosen quantity from the number input", async () => {
  bagClient(() => emptyCart());
  await mount(withProviders(guestAuth, React.createElement(ProductDetails, { product })));
  const input = host.querySelector("#product-quantity");
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, "3");
  await act(async () => { input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  await click(buttonByLabel("Add Fixture mug to Bag"));
  assert.deepEqual(readStored().items.map(item => item.quantity), [3]);
  assert.match(host.textContent, /Added 3 × Fixture mug to your Bag/);
});

test("details quantity input ignores empty, zero, negative and decimal typing", async () => {
  bagClient(() => emptyCart());
  await mount(withProviders(guestAuth, React.createElement(ProductDetails, { product })));
  const input = host.querySelector("#product-quantity");
  for (const raw of ["", "0", "-5", "2.5"]) {
    await typeQuantity(input, raw);
    assert.equal(input.value, "1", `typing ${JSON.stringify(raw)} must not change the committed quantity`);
  }
  await click(buttonByLabel("Add Fixture mug to Bag"));
  assert.deepEqual(readStored().items.map(item => item.quantity), [1], "only the committed quantity reaches the cart");
});

test("details quantity input clamps above 99 and the stepper respects the 1 and 99 boundaries", async () => {
  bagClient(() => emptyCart());
  await mount(withProviders(guestAuth, React.createElement(ProductDetails, { product })));
  const input = host.querySelector("#product-quantity");
  const minus = buttonByLabel("Decrease Fixture mug quantity");
  const plus = buttonByLabel("Increase Fixture mug quantity");
  assert.equal(minus.disabled, true, "decrement is disabled at the lower boundary");
  assert.equal(plus.disabled, false);
  await typeQuantity(input, "100");
  assert.equal(input.value, "99", "100 clamps to the upper boundary");
  await typeQuantity(input, "999");
  assert.equal(input.value, "99", "999 clamps to the upper boundary");
  assert.equal(buttonByLabel("Increase Fixture mug quantity").disabled, true, "increment is disabled at the upper boundary");
  await click(buttonByLabel("Decrease Fixture mug quantity"));
  assert.equal(host.querySelector("#product-quantity").value, "98");
  assert.equal(buttonByLabel("Increase Fixture mug quantity").disabled, false);
  await click(buttonByLabel("Increase Fixture mug quantity"));
  assert.equal(host.querySelector("#product-quantity").value, "99");
  await typeQuantity(input, "1");
  assert.equal(input.value, "1");
  assert.equal(buttonByLabel("Decrease Fixture mug quantity").disabled, true, "decrement returns to the disabled lower boundary");
});

test("details add is blocked when the existing quantity plus the requested amount would exceed 99", async () => {
  bagClient(() => emptyCart());
  sessionStorage.setItem("lume-guest-cart", JSON.stringify({
    version: 2,
    items: [{ productId: "fixture-mug", variantId: "v-default", quantity: 99, mergeId: "11111111-1111-4111-8111-111111111111" }],
  }));
  await mount(withProviders(guestAuth, React.createElement(ProductDetails, { product })));
  const add = buttonByLabel("Add Fixture mug to Bag");
  assert.equal(add.disabled, true, "99 in Bag + 1 requested exceeds the limit");
  assert.match(add.textContent, /Quantity limit reached/);
  await click(add);
  assert.equal(readStored().items.map(item => item.quantity).join(), "99", "the blocked add never mutates the cart");
  assert.equal(host.textContent.includes("Added"), false);
});

test("details quantity controls operate from the keyboard where the harness supports it", async () => {
  bagClient(() => emptyCart());
  await mount(withProviders(guestAuth, React.createElement(ProductDetails, { product })));
  const input = host.querySelector("#product-quantity");
  input.focus();
  assert.equal(document.activeElement, input, "the quantity input receives keyboard focus");
  await typeQuantity(input, "5");
  assert.equal(host.querySelector("#product-quantity").value, "5", "typed input commits");
  const plus = buttonByLabel("Increase Fixture mug quantity");
  plus.focus();
  assert.equal(document.activeElement, plus, "the increment control receives keyboard focus");
  await click(plus);
  assert.equal(host.querySelector("#product-quantity").value, "6");
  const minus = buttonByLabel("Decrease Fixture mug quantity");
  minus.focus();
  assert.equal(document.activeElement, minus, "the decrement control receives keyboard focus");
  await click(minus);
  assert.equal(host.querySelector("#product-quantity").value, "5");
});

test("authenticated Add to Bag saves once through the RPC, stays busy and cannot duplicate while saving", async () => {
  const change = deferred();
  const calls = bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(withProviders(userAuth, React.createElement(ProductDetails, { product })));
  assert.equal(calls.filter(call => call.name === "load_variant_cart").length, 1);
  const add = buttonByLabel("Add Fixture mug to Bag");
  assert.equal(add.disabled, false);
  await click(add);
  const changeCalls = calls.filter(call => call.name === "change_variant_cart");
  assert.equal(changeCalls.length, 1);
  const args = changeCalls[0].args;
  assert.equal(args.p_variant_id, "v-default");
  assert.equal(args.p_mode, "add");
  assert.equal(args.p_quantity, 1);
  assert.equal(args.p_expected_quantity, null);
  assert.match(args.p_operation_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(add.disabled, true);
  assert.match(add.textContent, /Adding…/);
  assert.equal(host.querySelector("#product-quantity").disabled, true, "quantity input disables while saving");
  assert.equal(buttonByLabel("Increase Fixture mug quantity").disabled, true, "stepper disables while saving");
  await click(add);
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1);
  await settle(change, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  assert.equal(buttonByLabel("Add Fixture mug to Bag").disabled, false);
  assert.match(buttonByLabel("Add Fixture mug to Bag").textContent, /Add to Bag/);
  assert.equal(host.querySelector("#product-quantity").disabled, false, "quantity input re-enables after the save settles");
  assert.equal(buttonByLabel("Increase Fixture mug quantity").disabled, false, "stepper re-enables after the save settles");
  assert.match(host.textContent, /Added 1 × Fixture mug to your Bag/);
});

test("authenticated Add to Bag failure surfaces the global alert, keeps the Bag unchanged and recovers", async () => {
  const change = deferred();
  const calls = bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  const add = buttonByLabel("Add Fixture mug to Bag");
  await click(add);
  await settle(change, { data: null, error: { code: "23505", message: "fixture failure" } });
  const alert = host.querySelector('[role="alert"]');
  assert.ok(alert);
  assert.match(alert.textContent, /Your Bag change could not be confirmed/);
  assert.match(alert.textContent, /Retry saved Bag/);
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /couldn't confirm adding Fixture mug to your Bag/);
  assert.doesNotMatch(toast.textContent, /was not added/);
  assert.doesNotMatch(host.textContent, /Added 1 × Fixture mug to your Bag/);
  assert.equal(buttonByLabel("Add Fixture mug to Bag").disabled, false);
  assert.match(buttonByLabel("Add Fixture mug to Bag").textContent, /Add to Bag/);
  await click(button("Retry saved Bag"));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  assert.equal(calls.filter(call => call.name === "load_variant_cart").length, 2);
  assert.equal(host.querySelector('[role="alert"]'), null);
});

test("rapid guest double dispatch merges into one line instead of duplicating", async () => {
  bagClient(() => emptyCart());
  await mount(withProviders(guestAuth, React.createElement(DoubleAddProbe)));
  await click(button("double-add"));
  assert.equal(host.querySelector("#probe-count").textContent, "2");
  assert.deepEqual(readStored().items.map(item => item.quantity), [2]);
  assert.equal(readStored().items.length, 1);
});

test("rapid authenticated double dispatch issues a single serialized mutation", async () => {
  const change = deferred();
  const calls = bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(withProviders(userAuth, React.createElement(DoubleAddProbe)));
  await click(button("double-add"));
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1);
  await settle(change, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  assert.equal(host.querySelector("#probe-count").textContent, "1");
});

test("header Bag count reflects guest intent units after additions", async () => {
  bagClient(() => emptyCart());
  await mount(layoutTree(guestAuth));
  assert.match(host.querySelector('a[aria-label^="Bag ("]').getAttribute("aria-label"), /Bag \(0\)/);
  await click(buttonByLabel("Add Fixture mug to Bag"));
  assert.match(host.querySelector('a[aria-label^="Bag ("]').getAttribute("aria-label"), /Bag \(1\)/);
  await click(buttonByLabel("Add Fixture mug to Bag"));
  assert.match(host.querySelector('a[aria-label^="Bag ("]').getAttribute("aria-label"), /Bag \(2\)/);
});

test("guest Bag page updates quantities and removals in local storage with derived totals", async () => {
  bagClient(() => emptyCart());
  sessionStorage.setItem("lume-guest-cart", JSON.stringify({
    version: 2,
    items: [{ productId: "fixture-mug", variantId: "v-default", quantity: 2, mergeId: "11111111-1111-4111-8111-111111111111" }],
  }));
  await mount(withProviders(guestAuth, React.createElement(CartPage)));
  assert.match(host.textContent, /NLe 36/);
  await click(buttonByLabel("Increase Fixture mug quantity"));
  assert.deepEqual(readStored().items.map(item => item.quantity), [3]);
  assert.match(host.textContent, /NLe 54/);
  assert.match(host.textContent, /Bag subtotal NLe 54\./);
  await click(buttonByLabel("Remove Fixture mug"));
  assert.deepEqual(readStored().items, []);
  assert.match(host.textContent, /Your Bag is taking a slow day/);
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast, "removal confirmation survives the empty-state transition");
  assert.match(toast.textContent, /Removed Fixture mug from your Bag/);
});

test("cart quantity input ignores empty, zero, negative, decimal and over-limit typing and commits valid values", async () => {
  bagClient(() => emptyCart());
  sessionStorage.setItem("lume-guest-cart", JSON.stringify({
    version: 2,
    items: [{ productId: "fixture-mug", variantId: "v-default", quantity: 2, mergeId: "11111111-1111-4111-8111-111111111111" }],
  }));
  await mount(withProviders(guestAuth, React.createElement(CartPage)));
  const input = host.querySelector('input[type="number"]');
  for (const raw of ["", "0", "-3", "2.5", "100"]) {
    await typeQuantity(input, raw);
    assert.equal(input.value, "2", `typing ${JSON.stringify(raw)} must not change the committed quantity`);
    assert.deepEqual(readStored().items.map(item => item.quantity), [2], "rejected typing never reaches storage");
  }
  await typeQuantity(input, "7");
  assert.equal(input.value, "7", "a valid typed quantity commits");
  assert.deepEqual(readStored().items.map(item => item.quantity), [7]);
  assert.match(host.textContent, /NLe 126/);
});

test("cart quantity controls enforce the lower boundary at 1", async () => {
  bagClient(() => emptyCart());
  sessionStorage.setItem("lume-guest-cart", JSON.stringify({
    version: 2,
    items: [{ productId: "fixture-mug", variantId: "v-default", quantity: 1, mergeId: "11111111-1111-4111-8111-111111111111" }],
  }));
  await mount(withProviders(guestAuth, React.createElement(CartPage)));
  assert.equal(buttonByLabel("Decrease Fixture mug quantity").disabled, true, "decrement is disabled at 1");
  await click(buttonByLabel("Increase Fixture mug quantity"));
  assert.deepEqual(readStored().items.map(item => item.quantity), [2]);
  assert.equal(buttonByLabel("Decrease Fixture mug quantity").disabled, false);
  await click(buttonByLabel("Decrease Fixture mug quantity"));
  assert.deepEqual(readStored().items.map(item => item.quantity), [1]);
  assert.equal(buttonByLabel("Decrease Fixture mug quantity").disabled, true, "decrement returns to the disabled boundary at 1");
});

test("cart quantity controls enforce the upper boundary at 99", async () => {
  bagClient(() => emptyCart());
  sessionStorage.setItem("lume-guest-cart", JSON.stringify({
    version: 2,
    items: [{ productId: "fixture-mug", variantId: "v-default", quantity: 99, mergeId: "11111111-1111-4111-8111-111111111111" }],
  }));
  await mount(withProviders(guestAuth, React.createElement(CartPage)));
  assert.match(host.textContent, /NLe 1,782/);
  assert.equal(buttonByLabel("Increase Fixture mug quantity").disabled, true, "increment is disabled at 99");
  await click(buttonByLabel("Decrease Fixture mug quantity"));
  assert.deepEqual(readStored().items.map(item => item.quantity), [98]);
  assert.equal(buttonByLabel("Increase Fixture mug quantity").disabled, false);
  await click(buttonByLabel("Increase Fixture mug quantity"));
  assert.deepEqual(readStored().items.map(item => item.quantity), [99]);
  assert.equal(buttonByLabel("Increase Fixture mug quantity").disabled, true, "increment returns to the disabled boundary at 99");
});

test("cart controls disable while a removal is saving and recover when it settles", async () => {
  const change = deferred();
  bagClient(name => {
    if (name === "load_variant_cart")
      return Promise.resolve({ data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
    return change.promise;
  });
  await mount(withProviders(userAuth, React.createElement(CartPage)));
  await click(buttonByLabel("Remove Fixture mug"));
  assert.equal(buttonByLabel("Remove Fixture mug").disabled, true, "remove disables while saving");
  assert.equal(buttonByLabel("Increase Fixture mug quantity").disabled, true, "stepper disables while saving");
  assert.equal(buttonByLabel("Decrease Fixture mug quantity").disabled, true, "stepper disables while saving");
  assert.equal(host.querySelector('input[type="number"]').disabled, true, "quantity input disables while saving");
  await settle(change, { data: { id: "cart-1", items: [] }, error: null });
  assert.match(host.textContent, /Your Bag is taking a slow day/);
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /Removed Fixture mug from your Bag/);
});

test("authenticated Bag page removal failure shows no success claim and keeps the line", async () => {
  const change = deferred();
  const calls = bagClient(name => {
    if (name === "load_variant_cart")
      return Promise.resolve({ data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
    return change.promise;
  });
  await mount(withProviders(userAuth, React.createElement(CartPage)));
  await click(buttonByLabel("Remove Fixture mug"));
  await settle(change, { data: null, error: { code: "P0001", message: "fixture removal failure" } });
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /couldn't confirm removing Fixture mug from your Bag/);
  assert.doesNotMatch(toast.textContent, /was not removed/);
  assert.doesNotMatch(host.textContent, /Removed Fixture mug from your Bag/);
  assert.match(host.textContent, /NLe 36/);
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1);
  assert.equal(buttonByLabel("Remove Fixture mug").disabled, false);
});

test("authenticated Bag page quantity and removal use set and remove RPC modes", async () => {
  const changes = [];
  const calls = bagClient(name => {
    if (name === "load_variant_cart")
      return Promise.resolve({ data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
    const next = deferred();
    changes.push(next);
    return next.promise;
  });
  await mount(withProviders(userAuth, React.createElement(CartPage)));
  assert.match(host.textContent, /NLe 36/);
  await click(buttonByLabel("Increase Fixture mug quantity"));
  const setCall = calls.find(call => call.name === "change_variant_cart");
  assert.equal(setCall.args.p_variant_id, "v-default");
  assert.equal(setCall.args.p_mode, "set");
  assert.equal(setCall.args.p_quantity, 3);
  assert.equal(setCall.args.p_expected_quantity, 2);
  assert.match(setCall.args.p_operation_id, /^[0-9a-f-]{36}$/);
  await settle(changes[0], { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 3 }] }, error: null });
  assert.match(host.textContent, /NLe 54/);
  await click(buttonByLabel("Remove Fixture mug"));
  const removeCall = calls.filter(call => call.name === "change_variant_cart").pop();
  assert.equal(removeCall.args.p_variant_id, "v-default");
  assert.equal(removeCall.args.p_mode, "remove");
  assert.equal(removeCall.args.p_quantity, null);
  assert.equal(removeCall.args.p_expected_quantity, 3);
  await settle(changes[1], { data: { id: "cart-1", items: [] }, error: null });
  assert.match(host.textContent, /Your Bag is taking a slow day/);
});

test("guest items merge into the authenticated Bag on sign-in with stable receipts", async () => {
  sessionStorage.setItem("lume-guest-cart", JSON.stringify({
    version: 2,
    items: [{ productId: "fixture-mug", variantId: "v-default", quantity: 2, mergeId: "11111111-1111-4111-8111-111111111111" }],
  }));
  const merge = deferred();
  const calls = bagClient(name => (name === "load_variant_cart" ? emptyCart() : merge.promise));
  await mount(withProviders(userAuth, React.createElement(CartPage)));
  const mergeCall = calls.find(call => call.name === "change_variant_cart");
  assert.equal(mergeCall.args.p_mode, "merge");
  assert.equal(mergeCall.args.p_quantity, 2);
  assert.equal(mergeCall.args.p_expected_quantity, null);
  assert.equal(mergeCall.args.p_operation_id, "11111111-1111-4111-8111-111111111111");
  await settle(merge, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
  assert.match(host.textContent, /NLe 36/);
  assert.deepEqual(readStored().items, []);
});

test("shop toast keeps only the newest confirmation", async () => {
  bagClient(() => emptyCart());
  await mount(layoutTree(guestAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  const toasts = host.querySelectorAll(".bag-notice");
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].textContent, /Added 1 × Fixture mug to your Bag/);
});

test("Product Details actions group keeps the Bag link beside a reserved notice slot", async () => {
  bagClient(() => emptyCart());
  await mount(withProviders(guestAuth, React.createElement(ProductDetails, { product })));
  const group = host.querySelector(".product-details-actions");
  assert.ok(group);
  const link = group.querySelector('a[href="/cart"]');
  assert.ok(link);
  assert.match(link.textContent, /View your Bag/);
  assert.equal(group.querySelector(".feedback").textContent, "");
  await click(buttonByLabel("Add Fixture mug to Bag"));
  const sameLink = group.querySelector('a[href="/cart"]');
  assert.equal(sameLink, link, "notice appearance must not replace or move the link within the group");
  assert.match(group.querySelector(".feedback").textContent, /Added 1 × Fixture mug to your Bag/);
});

test("an obsolete add failure after switching accounts shows no feedback under the new identity", async () => {
  const change = deferred();
  const calls = bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1);
  await rerender(layoutTree(userAuthB));
  await settleError(change, new TypeError("Failed to fetch"));
  assert.equal(host.querySelector(".bag-notice"), null, "no toast from A's obsolete operation under B");
  assert.equal(host.querySelector('[role="alert"]'), null, "no global failure from A's obsolete operation under B");
});

test("a deferred add rejecting after an account switch resolves to superseded", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(withProviders(userAuth, React.createElement(OutcomeProbe)));
  await click(button("probe-add"));
  await rerender(withProviders(userAuthB, React.createElement(OutcomeProbe)));
  await settleError(change, new TypeError("Failed to fetch"));
  await flush();
  assert.deepEqual(recorded, ["superseded"]);
});

test("a deferred add resolving after an account switch resolves to superseded", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(withProviders(userAuth, React.createElement(OutcomeProbe)));
  await click(button("probe-add"));
  await rerender(withProviders(userAuthB, React.createElement(OutcomeProbe)));
  await settle(change, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  await flush();
  assert.deepEqual(recorded, ["superseded"]);
});

test("an obsolete add resolving after sign-out shows no success under the guest identity", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await rerender(layoutTree(guestAuth));
  await settle(change, { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  await flush();
  assert.equal(host.querySelector(".bag-notice"), null, "no success claimed for A's obsolete operation as a guest");
  assert.match(host.querySelector('a[aria-label^="Bag ("]').getAttribute("aria-label"), /Bag \(0\)/, "A's cart never appears under the guest identity");
});

test("an obsolete removal completion cannot replace B's newer confirmation", async () => {
  const changes = [];
  bagClient(name => {
    if (name === "load_variant_cart")
      return Promise.resolve({ data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
    const next = deferred();
    changes.push(next);
    return next.promise;
  });
  await mount(layoutTree(userAuth, "/cart"));
  await click(buttonByLabel("Remove Fixture mug"));
  assert.equal(changes.length, 1, "A's removal is deferred in flight");
  await rerender(layoutTree(userAuthB, "/cart"));
  await click(buttonByLabel("Remove Fixture mug"));
  assert.equal(changes.length, 2, "B's newer removal starts after the restore completes");
  await settle(changes[1], { data: { id: "cart-1", items: [] }, error: null });
  let toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /Removed Fixture mug from your Bag/);
  await settleError(changes[0], new TypeError("Failed to fetch"));
  toast = host.querySelector(".bag-notice");
  assert.ok(toast, "B's confirmation stays mounted when A's request settles");
  assert.match(toast.textContent, /Removed Fixture mug from your Bag/, "B's newer confirmation remains visible");
  assert.doesNotMatch(host.textContent, /couldn't confirm removing/);
  assert.equal(host.querySelector('[role="alert"]'), null, "the obsolete failure raises no global alert");
  assert.match(host.textContent, /Your Bag is taking a slow day/);
  assert.doesNotMatch(host.textContent, /Saving your Bag/, "pending status stays cleared after the active operation finished");
});

test("an obsolete completion cannot clear the newer operation's pending state or replace its confirmation", async () => {
  const twoCatalog = { state: { status: "ready", products: [product, productTwo] }, refresh() {} };
  const changes = [];
  bagClient(name => {
    if (name === "load_variant_cart") return emptyCart();
    const next = deferred();
    changes.push(next);
    return next.promise;
  });
  await mount(withProviders(userAuth, React.createElement(ShopPage), twoCatalog));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  assert.equal(changes.length, 1, "A's add is deferred in flight");
  await rerender(withProviders(userAuthB, React.createElement(ShopPage), twoCatalog));
  assert.match(buttonByLabel("Add Fixture mug to Bag").textContent, /Adding…/, "the in-flight pending state survives the identity restore");
  assert.equal(buttonByLabel("Add Fixture mug to Bag").disabled, true);
  const vaseAdd = buttonByLabel("Add Fixture vase to Bag");
  assert.equal(vaseAdd.disabled, false, "the active account can start a newer operation");
  await click(vaseAdd);
  assert.equal(changes.length, 2);
  assert.match(buttonByLabel("Add Fixture vase to Bag").textContent, /Adding…/, "pending state belongs to the active operation");
  await settle(changes[1], { data: { id: "cart-1", items: [{ product_id: "fixture-vase", variant_id: "v-vase", quantity: 1 }] }, error: null });
  let toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /Added 1 × Fixture vase to your Bag/);
  assert.match(buttonByLabel("Add Fixture mug to Bag").textContent, /Add to Bag/, "pending clears when the active operation finishes");
  assert.equal(buttonByLabel("Add Fixture mug to Bag").disabled, false);
  await settleError(changes[0], new TypeError("Failed to fetch"));
  toast = host.querySelector(".bag-notice");
  assert.ok(toast, "A's obsolete rejection does not clear the notice");
  assert.match(toast.textContent, /Added 1 × Fixture vase to your Bag/, "B's newer confirmation remains visible");
  assert.doesNotMatch(host.textContent, /couldn't confirm adding/);
  assert.match(buttonByLabel("Add Fixture mug to Bag").textContent, /Add to Bag/);
});

test("unmounting before a deferred add settles leaves no stale feedback behind", async () => {
  const change = deferred();
  bagClient(name => (name === "load_variant_cart" ? emptyCart() : change.promise));
  await mount(withProviders(userAuth, React.createElement(ShopPage)));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await act(async () => { root.unmount(); });
  root = null;
  await assert.doesNotReject(async () => {
    await settleError(change, new TypeError("Failed to fetch"));
  });
  assert.equal(host.querySelector(".bag-notice"), null);
});

test("dispatch reports direct confirmed, rejected and superseded outcomes", async () => {
  const changes = [];
  const calls = bagClient(name => {
    if (name === "load_variant_cart") return emptyCart();
    const next = deferred();
    changes.push(next);
    return next.promise;
  });
  await mount(withProviders(userAuth, React.createElement(OutcomeProbe)));
  await click(button("probe-add"));
  assert.equal(changes.length, 1);
  await settle(changes[0], { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  await flush();
  assert.deepEqual(recorded, ["confirmed"]);
  await click(button("probe-bad"));
  await flush();
  assert.deepEqual(recorded, ["confirmed", "superseded"], "an invalid quantity resolves superseded");
  assert.equal(changes.length, 1, "a superseded dispatch never reaches the mutation RPC");
  await click(button("probe-add"));
  assert.equal(changes.length, 2);
  await settleError(changes[1], new TypeError("Failed to fetch"));
  await flush();
  assert.deepEqual(recorded, ["confirmed", "superseded", "rejected"]);
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 2);
});

test("a concurrent second dispatch resolves superseded while the first deferred mutation serializes", async () => {
  const changes = [];
  bagClient(name => {
    if (name === "load_variant_cart") return emptyCart();
    const next = deferred();
    changes.push(next);
    return next.promise;
  });
  await mount(withProviders(userAuth, React.createElement(DoubleAddProbe)));
  await click(button("double-add"));
  await flush();
  assert.equal(changes.length, 1, "the lock serializes concurrent dispatches into one mutation");
  assert.deepEqual(recorded, ["superseded"], "the blocked dispatch resolves superseded immediately");
  await settle(changes[0], { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
  await flush();
  assert.deepEqual(recorded, ["superseded", "confirmed"]);
  assert.equal(host.querySelector("#probe-count").textContent, "2");
});

test("a newer confirmed success is followed only by a superseded older rejection", async () => {
  const changes = [];
  bagClient(name => {
    if (name === "load_variant_cart") return emptyCart();
    const next = deferred();
    changes.push(next);
    return next.promise;
  });
  await mount(withProviders(userAuth, React.createElement(OutcomeProbe)));
  await click(button("probe-add"));
  await rerender(withProviders(userAuthB, React.createElement(OutcomeProbe)));
  await click(button("probe-add"));
  assert.equal(changes.length, 2, "B's newer operation runs while A's older one is still in flight");
  await settle(changes[1], { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  await flush();
  assert.deepEqual(recorded, ["confirmed"], "B's newer operation confirms first");
  await settleError(changes[0], new TypeError("Failed to fetch"));
  await flush();
  assert.deepEqual(recorded, ["confirmed", "superseded"], "A's older rejection never surfaces as rejected");
});

test("a real guest-to-account transition merges the guest item with its stored receipt", async () => {
  const merges = [];
  const calls = bagClient(name => {
    if (name === "load_variant_cart") return emptyCart();
    const next = deferred();
    merges.push(next);
    return next.promise;
  });
  await mount(layoutTree(guestAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  const receipt = readStored().items[0].mergeId;
  assert.match(receipt, /^[0-9a-f-]{36}$/);
  await rerender(layoutTree(userAuth));
  const mergeCalls = calls.filter(call => call.name === "change_variant_cart");
  assert.equal(mergeCalls.length, 1, "restore is waiting on the guest merge");
  assert.equal(mergeCalls[0].args.p_mode, "merge");
  assert.equal(mergeCalls[0].args.p_quantity, 1);
  assert.equal(mergeCalls[0].args.p_operation_id, receipt, "stable sign-in merge receipt");
  await settle(merges[0], { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  await flush();
  assert.match(host.querySelector('a[aria-label^="Bag ("]').getAttribute("aria-label"), /Bag \(1\)/);
  assert.equal(readStored().items.length, 0, "guest intent is consumed by the successful merge");
});

test("a simulated merge failure keeps the guest receipt, surfaces the global retry and recovers without duplicates", async () => {
  const merges = [];
  const calls = bagClient(name => {
    if (name === "load_variant_cart") return emptyCart();
    const next = deferred();
    merges.push(next);
    return next.promise;
  });
  await mount(layoutTree(guestAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  const receipt = readStored().items[0].mergeId;
  await rerender(layoutTree(userAuth));
  assert.equal(merges.length, 1);
  await settleError(merges[0], new TypeError("Failed to fetch"));
  await flush();
  const alert = host.querySelector('[role="alert"]');
  assert.ok(alert);
  assert.match(alert.textContent, /could not be restored or merged/);
  assert.match(alert.textContent, /Retry saved Bag/);
  assert.equal(readStored().items.length, 1, "guest intent is retained after the merge failure");
  await click(button("Retry saved Bag"));
  await flush();
  const mergeCalls = calls.filter(call => call.name === "change_variant_cart");
  assert.equal(mergeCalls.length, 2, "the retry re-runs the restore merge");
  assert.equal(mergeCalls[1].args.p_operation_id, receipt, "the retry reuses the stable merge receipt");
  await settle(merges[1], { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
  await flush();
  assert.equal(host.querySelector('[role="alert"]'), null, "recovery clears the global alert");
  assert.match(host.querySelector('a[aria-label^="Bag ("]').getAttribute("aria-label"), /Bag \(1\)/, "exactly one merged line, no duplicates");
  assert.equal(readStored().items.length, 0);
});

test("uncertain add after a lost RPC response makes no definite claim and reload reconciles the applied line", async () => {
  const change = deferred();
  let loads = 0;
  const calls = bagClient(name => {
    if (name === "load_variant_cart") {
      loads += 1;
      // The synthetic server committed the add, but the response was lost in transit.
      return Promise.resolve(loads === 1
        ? { data: { id: "cart-1", items: [] }, error: null }
        : { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
    }
    return change.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settleError(change, new TypeError("Failed to fetch"));
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /couldn't confirm adding Fixture mug to your Bag/);
  assert.match(toast.textContent, /Check your Bag before trying again/);
  assert.doesNotMatch(host.textContent, /was not added|Added 1 × Fixture mug to your Bag/);
  assert.ok(host.querySelector('[role="alert"]'), "global retry path stays available");
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1, "uncertain mutations are never repeated automatically");
  await click(button("Retry saved Bag"));
  await flush();
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1, "reload does not replay the uncertain mutation");
  assert.match(host.querySelector('a[aria-label^="Bag ("]').getAttribute("aria-label"), /Bag \(1\)/, "reload reconciles the actually-applied line");
});

test("uncertain add with a malformed saved-cart response after commit makes no definite claim and reload reconciles", async () => {
  const change = deferred();
  let loads = 0;
  const calls = bagClient(name => {
    if (name === "load_variant_cart") {
      loads += 1;
      return Promise.resolve(loads === 1
        ? { data: { id: "cart-1", items: [] }, error: null }
        : { data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 1 }] }, error: null });
    }
    return change.promise;
  });
  await mount(layoutTree(userAuth));
  await click(buttonByLabel("Add Fixture mug to Bag"));
  await settle(change, { data: { unexpected: "shape" }, error: null });
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /couldn't confirm adding Fixture mug to your Bag/);
  assert.doesNotMatch(host.textContent, /was not added|Added 1 × Fixture mug to your Bag/);
  assert.ok(host.querySelector('[role="alert"]'));
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1);
  await click(button("Retry saved Bag"));
  await flush();
  assert.match(host.querySelector('a[aria-label^="Bag ("]').getAttribute("aria-label"), /Bag \(1\)/, "reload reconciles the actually-applied line");
});

test("uncertain removal after a lost RPC response makes no definite claim and reload reconciles the removed line", async () => {
  const change = deferred();
  let loads = 0;
  const calls = bagClient(name => {
    if (name === "load_variant_cart") {
      loads += 1;
      // The synthetic server committed the removal, but the response was lost in transit.
      return Promise.resolve({ data: { id: "cart-1", items: loads === 1 ? [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] : [] }, error: null });
    }
    return change.promise;
  });
  await mount(layoutTree(userAuth, "/cart"));
  assert.match(host.textContent, /NLe 36/);
  await click(buttonByLabel("Remove Fixture mug"));
  await settleError(change, new TypeError("Failed to fetch"));
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /couldn't confirm removing Fixture mug from your Bag/);
  assert.match(toast.textContent, /Check your Bag before trying again/);
  assert.doesNotMatch(host.textContent, /was not removed|Removed Fixture mug from your Bag/);
  assert.ok(host.querySelector('[role="alert"]'));
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1, "uncertain removals are never repeated automatically");
  await click(button("Retry saved Bag"));
  await flush();
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1);
  assert.match(host.textContent, /Your Bag is taking a slow day/, "reload reconciles the actually-removed line");
  assert.match(host.querySelector('a[aria-label^="Bag ("]').getAttribute("aria-label"), /Bag \(0\)/);
});

test("uncertain removal with a malformed saved-cart response makes no definite claim", async () => {
  const change = deferred();
  const calls = bagClient(name => {
    if (name === "load_variant_cart")
      return Promise.resolve({ data: { id: "cart-1", items: [{ product_id: "fixture-mug", variant_id: "v-default", quantity: 2 }] }, error: null });
    return change.promise;
  });
  await mount(layoutTree(userAuth, "/cart"));
  await click(buttonByLabel("Remove Fixture mug"));
  await settle(change, { data: null, error: null });
  const toast = host.querySelector(".bag-notice");
  assert.ok(toast);
  assert.match(toast.textContent, /couldn't confirm removing Fixture mug from your Bag/);
  assert.doesNotMatch(host.textContent, /was not removed|Removed Fixture mug from your Bag/);
  assert.equal(calls.filter(call => call.name === "change_variant_cart").length, 1);
});

test("bag notice auto-expires after five seconds", async t => {
  const { BagNotice } = await server.ssrLoadModule("/src/components/BagNotice.tsx");
  function ExpireHost() {
    const [message, setMessage] = React.useState(null);
    return React.createElement("div", null,
      React.createElement("button", { type: "button", onClick: () => setMessage({ id: 1, tone: "success", text: "Added 1 × Fixture mug to your Bag" }) }, "show"),
      React.createElement(BagNotice, { message, onExpire: () => setMessage(null) }));
  }
  await mount(React.createElement(ExpireHost));
  assert.equal(host.querySelector(".bag-notice"), null);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await click(button("show"));
    assert.ok(host.querySelector(".bag-notice"));
    await act(async () => { t.mock.timers.tick(4999); });
    assert.ok(host.querySelector(".bag-notice"));
    await act(async () => { t.mock.timers.tick(1); });
    assert.equal(host.querySelector(".bag-notice"), null);
  } finally {
    t.mock.timers.reset();
  }
});

test("a replacement notice shows only the newest message", async () => {
  const { BagNotice } = await server.ssrLoadModule("/src/components/BagNotice.tsx");
  function ReplaceHost() {
    const [message, setMessage] = React.useState(null);
    return React.createElement("div", null,
      React.createElement("button", { type: "button", onClick: () => setMessage({ id: 1, tone: "success", text: "First message" }) }, "one"),
      React.createElement("button", { type: "button", onClick: () => setMessage({ id: 2, tone: "failure", text: "Second message" }) }, "two"),
      React.createElement(BagNotice, { message, onExpire: () => setMessage(null) }));
  }
  await mount(React.createElement(ReplaceHost));
  await click(button("one"));
  assert.match(host.textContent, /First message/);
  await click(button("two"));
  const toasts = host.querySelectorAll(".bag-notice");
  assert.equal(toasts.length, 1, "only the newest message is rendered");
  assert.match(toasts[0].textContent, /Second message/);
  assert.doesNotMatch(host.textContent, /First message/);
});

test("a second notice resets the expiry timing", async t => {
  const { BagNotice } = await server.ssrLoadModule("/src/components/BagNotice.tsx");
  function ResetHost() {
    const [message, setMessage] = React.useState(null);
    return React.createElement("div", null,
      React.createElement("button", { type: "button", onClick: () => setMessage({ id: 1, tone: "success", text: "First message" }) }, "one"),
      React.createElement("button", { type: "button", onClick: () => setMessage({ id: 2, tone: "failure", text: "Second message" }) }, "two"),
      React.createElement(BagNotice, { message, onExpire: () => setMessage(null) }));
  }
  await mount(React.createElement(ResetHost));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await click(button("one"));
    assert.ok(host.querySelector(".bag-notice"));
    await act(async () => { t.mock.timers.tick(4999); });
    assert.ok(host.querySelector(".bag-notice"));
    await click(button("two"));
    await act(async () => { t.mock.timers.tick(4999); });
    assert.ok(host.querySelector(".bag-notice"), "the second message keeps its own full expiry window");
    assert.match(host.textContent, /Second message/);
    await act(async () => { t.mock.timers.tick(1); });
    assert.equal(host.querySelector(".bag-notice"), null, "the second message expires on its own timing");
  } finally {
    t.mock.timers.reset();
  }
});

test("unmounting the notice clears its expiry timer", async t => {
  const { BagNotice } = await server.ssrLoadModule("/src/components/BagNotice.tsx");
  let expired = 0;
  function UnmountHost() {
    const [message, setMessage] = React.useState(null);
    return React.createElement("div", null,
      React.createElement("button", { type: "button", onClick: () => setMessage({ id: 1, tone: "success", text: "Mounted message" }) }, "show"),
      React.createElement(BagNotice, { message, onExpire: () => { expired += 1; setMessage(null); } }));
  }
  await mount(React.createElement(UnmountHost));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await click(button("show"));
    assert.ok(host.querySelector(".bag-notice"));
    await act(async () => { root.unmount(); });
    root = null;
    await act(async () => { t.mock.timers.tick(5000); });
    assert.equal(expired, 0, "cleanup cancelled the pending expiry timer");
    assert.equal(host.querySelector(".bag-notice"), null);
  } finally {
    t.mock.timers.reset();
  }
});

test("repeated identical notices render a fresh node for the live region", async () => {
  const { BagNotice } = await server.ssrLoadModule("/src/components/BagNotice.tsx");
  const text = "Added 1 × Fixture mug to your Bag";
  function RepeatHost() {
    const [message, setMessage] = React.useState(null);
    return React.createElement("div", null,
      React.createElement("button", { type: "button", onClick: () => setMessage({ id: 1, tone: "success", text }) }, "first"),
      React.createElement("button", { type: "button", onClick: () => setMessage({ id: 2, tone: "success", text }) }, "again"),
      React.createElement(BagNotice, { message, onExpire: () => setMessage(null) }));
  }
  await mount(React.createElement(RepeatHost));
  await click(button("first"));
  const first = host.querySelector(".bag-notice");
  assert.ok(first);
  assert.equal(first.textContent, text);
  await click(button("again"));
  const second = host.querySelector(".bag-notice");
  assert.ok(second);
  assert.notEqual(second, first, "an identical message arrives as a fresh node the live region can re-announce");
  assert.equal(second.textContent, text);
  assert.ok(host.querySelector('.bag-notice-region[role="status"][aria-live="polite"]'), "the polite live region stays present for announcements");
});
