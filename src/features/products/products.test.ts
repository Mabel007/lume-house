import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { catalog } from "./catalog.ts";
import { parseProducts } from "./products.ts";
import { loadProducts } from "./productRepository.ts";
import { getCartLines } from "../cart/cart.ts";

// Synthetic network fixtures only; not a fallback catalog or project configuration.
const row = {
  id: "fixture-product",
  name: "Test mug",
  description: "Test description",
  category: "Test category",
  price_cents: 1800,
  currency: "NLE",
  image_path: "/images/mug.svg",
  background_color: "#e9e3d8",
  active: true,
};
function clientWith(fetch: typeof globalThis.fetch) {
  return createClient("https://catalog.example.invalid", "unit-test-only", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch },
  });
}

test("maps database cents and image fields without changing prices", () => {
  assert.deepEqual(parseProducts([row], "NLE"), [
    {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      price: 1800,
      image: row.image_path,
      color: row.background_color,
    },
  ]);
  assert.deepEqual(parseProducts([], "NLE"), []);
});

test("rejects malformed, inactive, duplicate or unsupported-currency products", () => {
  for (const change of [
    { price_cents: -1 },
    { price_cents: 1.5 },
    { price_cents: "1800" },
    { price_cents: Number.MAX_SAFE_INTEGER + 1 },
    { currency: "EUR" },
    { currency: "USD" },
    { active: false },
    { name: "" },
    { image_path: "javascript:alert(1)" },
    { image_path: "//outside.example/image" },
    { background_color: "url(unsafe)" },
  ]) {
    assert.throws(() => parseProducts([{ ...row, ...change }], "NLE"));
  }
  assert.throws(() => parseProducts([row, row], "NLE"));
  assert.throws(() => parseProducts(null, "NLE"));
});

test("Supabase request selects active products in stable catalog order", async () => {
  let calls = 0;
  const client = clientWith(async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.pathname, "/rest/v1/products");
    assert.equal(url.searchParams.get("active"), "eq.true");
    assert.equal(url.searchParams.get("order"), "display_order.asc,id.asc");
    assert.ok(url.searchParams.get("select")?.includes("price_cents"));
    return new Response(JSON.stringify([row]), {
      headers: { "Content-Type": "application/json" },
    });
  });
  const products = await loadProducts(
    client,
    "NLE",
    new AbortController().signal,
  );
  assert.equal(calls, 1);
  assert.equal(products[0].price, 1800);
});

test("provider errors reject instead of falling back to demo products", async () => {
  const client = clientWith(
    async () =>
      new Response(
        JSON.stringify({ message: "Internal database detail", code: "42501" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
  );
  await assert.rejects(
    loadProducts(client, "NLE", new AbortController().signal),
    { message: "Products could not be loaded." },
  );
});

test("empty database result stays empty; cancelled fetch does not return products", async () => {
  const empty = clientWith(
    async () =>
      new Response("[]", { headers: { "Content-Type": "application/json" } }),
  );
  assert.deepEqual(
    await loadProducts(empty, "NLE", new AbortController().signal),
    [],
  );
  const controller = new AbortController();
  controller.abort();
  const aborted = clientWith(async (_input, init) => {
    init?.signal?.throwIfAborted();
    throw new Error("Expected abort");
  });
  await assert.rejects(loadProducts(aborted, "NLE", controller.signal));
});

test("cart totals follow refreshed catalog prices and unavailable items are identifiable", () => {
  const cart = [{ productId: row.id, quantity: 2 }];
  assert.equal(
    getCartLines(cart, parseProducts([row], "NLE"))[0].lineTotal,
    3600,
  );
  assert.equal(
    getCartLines(cart, parseProducts([{ ...row, price_cents: 2000 }], "NLE"))[0]
      .lineTotal,
    4000,
  );
  assert.deepEqual(getCartLines(cart, []), []);
  assert.equal(
    cart.length,
    1,
    "catalog refresh must not silently delete cart state",
  );
});

test("NLE database boundary preserves the local catalog IDs and prices", async () => {
 const rows = catalog.map((p) => ({ id:p.id,name:p.name,description:p.description,category:p.category,price_cents:p.price,currency:"NLE",image_path:p.image,background_color:p.color,active:p.active }));
 const client=clientWith(async()=>new Response(JSON.stringify(rows),{headers:{"Content-Type":"application/json"}}));
 assert.deepEqual(await loadProducts(client,"NLE",new AbortController().signal),catalog.map(p=>({id:p.id,name:p.name,description:p.description,category:p.category,price:p.price,image:p.image,color:p.color})));
});
