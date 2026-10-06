import { parseVariants, requiresOptions, variantLabel, variantAvailable, cataloguePrice } from "./variants.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { catalog } from "./catalog.ts";
import { parseProducts } from "./products.ts";
import { loadProducts } from "./productRepository.ts";
import { getCartLines } from "../cart/cart.ts";
import {searchProducts} from './search.ts';

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
function clientWith(fetch: typeof globalThis.fetch, variants?: unknown) {
  return createClient("https://catalog.example.invalid", "unit-test-only", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: async (input, init) => new URL(String(input)).pathname === "/rest/v1/product_variants" ? new Response(JSON.stringify(variants ?? {code:"PGRST205"}), {status:variants === undefined ? 404 : 200,headers:{"Content-Type":"application/json"}}) : fetch(input,init) },
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

test("variant boundary preserves defaults and meaningful combinations without fake options", () => {
  const base={id:'default:fixture-product',product_id:row.id,options:{},is_default:true,price_cents:1800,currency:'NLE',active:true,inventory_policy:'untracked'};
  const variants=parseVariants([base,{...base,id:'blue',is_default:false,options:{Color:'Blue',Size:'Small'},price_cents:2000}]);
  assert.equal(variants[0].productId,row.id);assert.equal(variantLabel(variants[0]),'');assert.equal(requiresOptions([variants[0]]),false);
  assert.equal(requiresOptions(variants),true);assert.equal(variantLabel(variants[1]),'Color: Blue · Size: Small');
  for(const change of [{active:false},{currency:'USD'},{price_cents:-1},{options:{Color:{}}},{options:{Color:''}},{options:{Color:'Blue'}},{inventory_policy:'unknown'}])assert.throws(()=>parseVariants([{...base,...change}]));
  assert.throws(()=>parseVariants([base,base]));
});

test("expanded catalogue associates active variant rows while legacy schema remains compatible", async () => {
  const variants=[{id:'default:fixture-product',product_id:row.id,options:{},is_default:true,price_cents:1800,currency:'NLE',active:true,inventory_policy:'untracked'}];
  const response=async()=>new Response(JSON.stringify([row]),{headers:{'Content-Type':'application/json'}});
  const expanded=await loadProducts(clientWith(response,variants),'NLE',new AbortController().signal);
  assert.equal(expanded[0].variants?.[0].id,variants[0].id);
  assert.equal((await loadProducts(clientWith(response),'NLE',new AbortController().signal))[0].variants,undefined);
  await assert.rejects(loadProducts(clientWith(response,[{...variants[0],product_id:'other'}]),'NLE',new AbortController().signal));
});
test('tracked catalogue availability is an authoritative boolean, never invented counts',async()=>{
 const variant={id:'default:fixture-product',product_id:row.id,options:{},is_default:true,price_cents:2000,currency:'NLE',active:true,inventory_policy:'tracked'};
 const calls:string[]=[];
 const client=clientWith(async input=>{
  const path=new URL(String(input)).pathname;calls.push(path);
  return new Response(JSON.stringify(path.includes('catalogue_variant_availability')?[{variant_id:variant.id,available:false}]:[row]),{headers:{'Content-Type':'application/json'}});
 },[variant]);
 const [product]=await loadProducts(client,'NLE',new AbortController().signal);
 assert.equal(product.price,2000);assert.equal(variantAvailable(product.variants![0]),false);
 assert.equal(variantAvailable({...product.variants![0],available:true}),true);
 assert.equal(variantAvailable({...product.variants![0],available:undefined}),false);
 assert.ok(calls.includes('/rest/v1/rpc/catalogue_variant_availability'));
 assert.equal('on_hand' in product.variants![0],false);
 const corrupt=clientWith(async input=>new Response(JSON.stringify(new URL(String(input)).pathname.includes('catalogue_variant_availability')?[{variant_id:variant.id,available:3}]:[row]),{headers:{'Content-Type':'application/json'}}),[variant]);
 await assert.rejects(loadProducts(corrupt,'NLE',new AbortController().signal),/availability/);
});
test('catalogue search combines all words with the existing category filter without mutating products',()=>{
 const products=[{name:'Café Mug',category:'Tableware',description:'Warm everyday coffee'},{name:'Soft Throw',category:'Textiles',description:'Warm woven texture'}];
 assert.deepEqual(searchProducts(products,'  ','All pieces'),products);
 assert.deepEqual(searchProducts(products,'CAFE coffee','All pieces'),[products[0]]);
 assert.deepEqual(searchProducts(products,'warm','Textiles'),[products[1]]);
 assert.deepEqual(searchProducts(products,'warm','Tableware'),[products[0]]);
 assert.deepEqual(searchProducts(products,'mug','Textiles'),[]);
 assert.deepEqual(searchProducts(products,'unknown','All pieces'),[]);
 assert.deepEqual(searchProducts(products,'woven soft','All pieces'),[products[1]]);
 assert.equal(products.length,2);
});
test('option previews use selectable variant prices rather than an unselectable technical default',()=>{
 const base={id:'default:test',productId:'test',options:{},isDefault:true,price:1000,currency:'NLE' as const,inventoryPolicy:'untracked' as const};
 assert.deepEqual(cataloguePrice({price:800,variants:[base]}),{price:1000,from:false});
 const choices=[base,{...base,id:'blue',isDefault:false,options:{Color:'Blue'},price:2500},{...base,id:'red',isDefault:false,options:{Color:'Red'},price:2000}];
 assert.deepEqual(cataloguePrice({price:800,variants:choices}),{price:2000,from:true});
 assert.deepEqual(cataloguePrice({price:800,variants:choices.map(variant=>({...variant,inventoryPolicy:'tracked',available:variant.id==='blue'}))}),{price:2500,from:true});
});
