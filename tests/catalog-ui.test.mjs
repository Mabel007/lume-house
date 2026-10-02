import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

let server;
let ProductContext, CartContext, ShopPage, CartPage, CheckoutPage;
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  ({ ProductContext } = await server.ssrLoadModule(
    "/src/features/products/ProductContext.ts",
  ));
  ({ CartContext } = await server.ssrLoadModule(
    "/src/features/cart/CartContext.ts",
  ));
  ({ ShopPage } = await server.ssrLoadModule(
    "/src/features/products/ShopPage.tsx",
  ));
  ({ CartPage } = await server.ssrLoadModule(
    "/src/features/cart/CartPage.tsx",
  ));
  ({ CheckoutPage } = await server.ssrLoadModule(
    "/src/features/checkout/CheckoutPage.tsx",
  ));
});
after(async () => {
  await server?.close();
});

const fixture = {
  id: "test-product",
  name: "Fixture mug",
  description: "Fixture description",
  category: "Fixture category",
  price: 1800,
  image: "/images/mug.svg",
  color: "#e9e3d8",
};
const items = [{ productId: fixture.id, quantity: 2 }];
function render(Page, state, cart = items) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        ProductContext.Provider,
        { value: { state, refresh() {} } },
        React.createElement(
          CartContext.Provider,
          { value: { items: cart, dispatch() {} } },
          React.createElement(Page),
        ),
      ),
    ),
  );
}

test("loading and error states do not show stale totals or add-to-cart actions", () => {
  for (const Page of [ShopPage, CartPage, CheckoutPage]) {
    const loading = render(Page, { status: "loading" });
    assert.match(loading, /Loading the collection/);
    assert.doesNotMatch(loading, /\$|Add to cart|Continue to checkout/);
    const failed = render(Page, { status: "error" });
    assert.match(failed, /The collection is unavailable/);
    assert.match(failed, /Try again/);
    assert.doesNotMatch(failed, /\$|Add to cart|Continue to checkout/);
  }
});
test("empty catalog does not fall back to demo products", () => {
  const html = render(ShopPage, { status: "ready", products: [] });
  assert.match(html, /There are no available products/);
  assert.doesNotMatch(html, /product-card|Everyday ceramic mug/);
});
test("ready catalog feeds cards, cart prices and disabled checkout", () => {
  const state = { status: "ready", products: [fixture] };
  assert.match(render(ShopPage, state), /Fixture mug/);
  assert.match(render(ShopPage, state), /Fixture category/);
  const cart = render(CartPage, state);
  assert.match(cart, /NLe 36/);
  assert.match(cart, /Choose at checkout/);
  const checkout = render(CheckoutPage, state);
  assert.match(checkout, /disabled=""[^>]*>Place order/);
  assert.match(checkout, /Use my contact phone number/);
  assert.match(
    render(CartPage, {
      status: "ready",
      products: [{ ...fixture, price: 2000 }],
    }),
    /NLe 40/,
  );
});
test("unavailable products can be removed and cannot proceed to checkout", () => {
  const state = { status: "ready", products: [] };
  const cart = render(CartPage, state);
  assert.match(cart, /Remove unavailable item 1/);
  assert.doesNotMatch(cart, /Continue to checkout|\$5\.00/);
  const checkout = render(CheckoutPage, state);
  assert.match(checkout, /Review your cart/);
  assert.doesNotMatch(checkout, /Place order/);
  assert.match(render(CartPage, state, []), /Your cart is taking a slow day/);
  assert.match(
    render(CheckoutPage, state, []),
    /Your cart is taking a slow day/,
  );
});

test("checkout localizes fields and honestly distinguishes delivery and payment", () => {
  const html = render(CheckoutPage, { status: "ready", products: [fixture] });
  for (const label of [
    "Full name",
    "Phone number",
    "Street address / landmark",
    "Area / community",
    "City / town",
    "Delivery instructions",
    "Orange Money",
    "Afrimoney",
    "Mobile-money number",
  ])
    assert.ok(html.includes(label));
  assert.match(html, /Delivery details needed/);
  assert.match(html, /Orders cannot be placed/);
  assert.match(html, /aria-describedby="payment-help payment-error"/);
  assert.doesNotMatch(
    html,
    /State \/ region|Postal code|ZIP|Demo delivery|payment successful|order confirmed/i,
  );
  assert.doesNotMatch(html, /chrisbarbz17|Naj Flex|Sheriff Drive/);
  assert.match(html, /name="delivery-zone" required/);
  assert.match(html, /NLe 40/);
  assert.match(html, /NLe 50/);
  assert.match(html, /NLe 60/);
  assert.doesNotMatch(html, /then 76|then 88|PIN|USSD/);
});

test("expanded catalog has accessible interactions, editorial sections and responsive frame", async () => {
  const { catalog } = await server.ssrLoadModule(
    "/src/features/products/catalog.ts",
  );
  const html = render(ShopPage, { status: "ready", products: catalog }, []);
  assert.equal((html.match(/class="product-card"/g) ?? []).length, 20);
  for (const p of catalog) assert.ok(html.includes(`Add ${p.name} to cart`));
  assert.match(html, /Shop by collection/);
  assert.match(html, /THE LUMÉ EDIT/);
  assert.match(html, /product-grid/);
  const { readFileSync } = await import("node:fs");
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /:focus-visible/);
});
