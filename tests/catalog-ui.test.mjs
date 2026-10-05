import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

let server;
let ProductContext, CartContext, ShopPage, CartPage, CheckoutPage;
let contentPages, routeTitle, aboutFragmentTarget;
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
  const { AboutPage } = await server.ssrLoadModule("/src/features/content/AboutPage.tsx");
  const { HelpPage } = await server.ssrLoadModule("/src/features/content/HelpPage.tsx");
  const policies = await server.ssrLoadModule("/src/features/content/PolicyPages.tsx");
  contentPages = {
    "/about": AboutPage, "/help": HelpPage,
    "/help/delivery-pickup": policies.DeliveryPickupPage,
    "/help/returns-refunds": policies.ReturnsRefundsPage,
    "/privacy": policies.PrivacyPage, "/terms": policies.TermsPage,
  };
  ({ routeTitle, aboutFragmentTarget } = await server.ssrLoadModule("/src/config/routeExperience.ts"));
});

function renderContent(path) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(contentPages[path])));
}

test("all six public content pages render without auth or catalog dependencies and are wired as routes", async () => {
  const { readFileSync } = await import("node:fs");
  const entry = readFileSync("src/main.tsx", "utf8");
  for (const path of Object.keys(contentPages)) {
    const html = renderContent(path);
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, path);
    assert.match(html, /<article/);
    assert.ok(entry.includes(`path="${path}"`), `missing route ${path}`);
    assert.doesNotMatch(html, /<form|Change Password|Forgot Password/);
  }
});

test("About contains approved brand foundation, focusable fragment headings and shopping CTA", () => {
  const html = renderContent("/about");
  assert.match(html, /<h1>A home should feel like yours\.<\/h1>/);
  assert.ok(html.includes("To make beautiful, thoughtfully selected home and lifestyle pieces accessible for creating spaces that feel personal, comfortable and considered."));
  for (const value of ["Thoughtful Design", "Everyday Beauty", "Quality &amp; Care", "Warm Service"]) assert.ok(html.includes(value));
  for (const id of ["our-story", "our-values"]) {
    assert.ok(html.includes(`id="${id}" tabindex="-1"`));
    assert.ok(html.includes(`href="/about#${id}"`));
  }
  assert.match(html, /href="\/"[^>]*>Explore the collection/);
  assert.doesNotMatch(html, /sustainab|artisan|certified|manufactur|founded in/i);
});

test("Help connects existing account/history and policies with honest contact guidance", () => {
  const html = renderContent("/help");
  for (const path of ["/account", "/account/orders", "/help/delivery-pickup", "/help/returns-refunds"]) assert.ok(html.includes(`href="${path}"`));
  assert.match(html, /mailto:contact@najbuilds.com/);
  assert.match(html, /portfolio ecommerce product by/);
  assert.match(html, /href="https:\/\/najbuilds.com"/);
  assert.match(html, /Never send PINs, OTPs, passwords or mobile-money secrets/);
  assert.match(html, /Sending a request does not cancel an order/);
});

test("policies preserve request eligibility, payment boundaries and separately confirmed fulfilment", () => {
  const returns = renderContent("/help/returns-refunds");
  assert.match(returns, /7 calendar days from receipt to request an eligible return/);
  assert.match(returns, /not an automatic refund guarantee/);
  assert.match(returns, /Eligibility is reviewed/);
  assert.match(returns, /does not process or verify those payments, or automate their refunds/);
  assert.doesNotMatch(returns, /refunds? (?:are|is) automatic|automatically refund|guaranteed refund|final.sale|non.returnable/i);
  for (const path of ["/help", "/help/delivery-pickup", "/help/returns-refunds", "/terms"]) {
    assert.match(renderContent(path), /Placing an order does not mean payment has been confirmed/);
  }
  const delivery = renderContent("/help/delivery-pickup");
  assert.match(delivery, /Pickup in Lumley, Freetown is free/);
  assert.match(delivery, /readiness are confirmed separately/);
  assert.doesNotMatch(delivery, /same.day|next.day|ready immediately/i);
  const privacy = renderContent("/privacy");
  for (const service of ["Google", "Supabase", "Vercel", "Resend"]) assert.ok(privacy.includes(service));
  assert.doesNotMatch(privacy, /GDPR|certif|retain.{0,20}\d+|delete your account|Google Analytics/i);
});

test("route title mapping preserves existing titles and assigns all six public titles", () => {
  const expected = { "/about": "About", "/help": "Help & Contact", "/help/delivery-pickup": "Delivery & Pickup", "/help/returns-refunds": "Returns & Refunds", "/privacy": "Privacy Policy", "/terms": "Terms & Conditions", "/": "Shop", "/cart": "Your cart", "/checkout": "Checkout", "/account/orders": "Your account", "/auth/callback": "Your account", "/orders/example/success": "Your order", "/unknown": "Page not found" };
  for (const [path, title] of Object.entries(expected)) assert.equal(routeTitle(path), title);
  assert.equal(routeTitle("/about/"), "About");
  assert.equal(routeTitle("/constructor"), "Page not found");
});

test("About fragment recognition is scoped, safely decoded and independent of route entry", () => {
  for (const hash of ["#our-story", "#our-values", "#our%2Dvalues"]) assert.ok(aboutFragmentTarget("/about", hash));
  assert.equal(aboutFragmentTarget("/about/", "#our-values"), "our-values");
  for (const hash of ["", "#main", "#unknown", "#%bad"]) assert.equal(aboutFragmentTarget("/about", hash), null);
  assert.equal(aboutFragmentTarget("/help", "#our-values"), null);
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
  assert.match(checkout, /disabled=""[^>]*>Sign in to place order/);
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
  assert.match(html, /Payment awaits confirmation/);
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
