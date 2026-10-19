import { test } from "node:test";
import assert from "node:assert/strict";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { authRedirect, startGoogleSignIn, watchSession } from "./auth.ts";
import { emptyProfile, mapProfile, profileValues, loadProfile, saveProfile } from "../account/profile.ts";
import { invalidPhoneMessage } from "../checkout/payment.ts";
import { loadCustomerCart, mergeGuestCart, writeCartItem, visibleCart } from "../cart/cartRepository.ts";
import { checkoutDefaults } from "../checkout/profileDefaults.ts";
import type { CartItem } from "../cart/cart.ts";

function database(results: { data?: unknown; error?: { code: string } | null }[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const client = { from(table: string) {
    calls.push({ method: "from", args: [table] });
    const result = results.shift() || { data: null, error: null };
    const query: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve) };
    for (const method of ["select", "eq", "insert", "update", "delete", "order", "maybeSingle", "single"]) query[method] = (...args: unknown[]) => { calls.push({ method, args }); return query; };
    return query;
  } } as unknown as SupabaseClient;
  return { client, calls };
}
test("Google redirect supports deployment origin and rejects cross-origin configuration", async () => {
  assert.equal(authRedirect("https://shop.example.invalid"), "https://shop.example.invalid/auth/callback");
  assert.throws(() => authRedirect("https://shop.example.invalid", "https://other.invalid/callback"));
  let options: unknown;
  const client = { auth: { signInWithOAuth: async (value: unknown) => { options = value; return { error: null }; } } } as unknown as SupabaseClient;
  await startGoogleSignIn(client, "https://shop.example.invalid/auth/callback");
  assert.deepEqual(options, { provider: "google", options: { redirectTo: "https://shop.example.invalid/auth/callback" } });
});
test("session restoration, auth events, sign-out and unsubscribe guard stale resolution", async () => {
  let event!: (event: string, session: Session | null) => void;
  let resolve!: (value: { data: { session: Session | null }; error: null }) => void;
  let unsubscribed = false;
  const client = { auth: { onAuthStateChange: (callback: typeof event) => { event = callback; return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } }; }, getSession: () => new Promise(done => { resolve = done; }) } } as unknown as SupabaseClient;
  const states: (Session | null)[] = [];
  const stop = watchSession(client, value => states.push(value), () => assert.fail("unexpected restore failure"));
  const session = { user: { id: "owner" } } as Session;
  event("SIGNED_IN", session); event("SIGNED_OUT", null);
  resolve({ data: { session }, error: null }); await new Promise(done => setImmediate(done));
  assert.deepEqual(states, [session, null]);
  stop(); event("SIGNED_IN", session); assert.equal(states.length, 2); assert.equal(unsubscribed, true);
});
test("cart visibility hides private intent on logout, identity switch and restoration", () => {
  const saved = { userId: "owner", items: [{ productId: "lamp", quantity: 1 }] };
  assert.deepEqual(visibleCart(false, "owner", saved, []), saved.items);
  assert.deepEqual(visibleCart(false, undefined, saved, []), []);
  assert.deepEqual(visibleCart(false, "another", saved, []), []);
  assert.deepEqual(visibleCart(true, "owner", saved, []), []);
});
test("checkout defaults copy profile values without mutating saved defaults or assuming payer", () => {
  const profile = { ...emptyProfile, full_name: "Customer", phone: "+23276521208", default_city: "Freetown" };
  const checkout = checkoutDefaults(profile, "identity@example.invalid");
  assert.equal(checkout.city, "Freetown"); assert.equal(checkout.email, "identity@example.invalid");
  checkout.fullName = "Recipient"; assert.equal(profile.full_name, "Customer");
  assert.equal("paymentPhone" in checkout, false);
});
test("profile mapping, nullable defaults and format validation do not duplicate Auth email", () => {
  assert.deepEqual(mapProfile(null), emptyProfile);
  assert.equal(mapProfile({ full_name: "Customer", email: "ignored" }).full_name, "Customer");
  const values = profileValues({ ...emptyProfile, phone: "76 521208", full_name: " Customer " });
  assert.equal(values.phone, "+23276521208"); assert.equal(values.full_name, "Customer"); assert.equal(values.default_city, null);
  assert.equal("email" in values, false);
  assert.throws(() => profileValues({ ...emptyProfile, phone: "bad" }));
});
test("profile phone accepts any Sierra Leone network with shared network-neutral guidance", () => {
  for (const [input, expected] of [
    ["88 790011", "+23288790011"],
    ["031521208", "+23231521208"],
    ["+23277521208", "+23277521208"],
    ["(232) 77-521208", "+23277521208"],
  ] as const)
    assert.equal(profileValues({ ...emptyProfile, phone: input }).phone, expected);
  assert.doesNotMatch(invalidPhoneMessage, /Orange|\+232\d/i);
  assert.throws(
    () => profileValues({ ...emptyProfile, phone: "+23376521208" }),
    (error: unknown) => error instanceof Error && error.message === invalidPhoneMessage,
  );
});
test("first profile is inserted; existing profile updates only permitted columns", async () => {
  const first = database([{ data: null }, {}]);
  assert.equal(await loadProfile(database([{ data: null }]).client, "owner"), null);
  await saveProfile(first.client, "owner", emptyProfile);
  assert.ok(first.calls.some(call => call.method === "insert" && (call.args[0] as { id: string }).id === "owner"));
  const existing = database([{ data: { full_name: "Old" } }, {}]);
  await saveProfile(existing.client, "owner", { ...emptyProfile, full_name: "New" });
  const update = existing.calls.find(call => call.method === "update")!;
  assert.equal("id" in (update.args[0] as object), false);
  const raced = database([{ data: null }, { error: { code: "23505" } }, {}]);
  await saveProfile(raced.client, "owner", emptyProfile);
  assert.ok(raced.calls.some(call => call.method === "update"));
});
test("authenticated cart restores, creates lazily and handles duplicate creation", async () => {
  const existing = database([{ data: { id: "cart" } }, { data: [{ product_id: "amber-candle", quantity: 2 }] }]);
  assert.deepEqual(await loadCustomerCart(existing.client, "owner"), { id: "cart", items: [{ productId: "amber-candle", quantity: 2 }] });
  assert.ok(existing.calls.some(call => call.method === "eq" && call.args[0] === "user_id" && call.args[1] === "owner"));
  const raced = database([{ data: null }, { error: { code: "23505" } }, { data: { id: "cart" } }, { data: [] }]);
  assert.equal((await loadCustomerCart(raced.client, "owner")).id, "cart");
});
test("cart insert, quantity-only update, delete and failure honor restricted grants", async () => {
  const db = database([{}, {}, {}, { error: { code: "network" } }]);
  await writeCartItem(db.client, "cart", "mug", 2, false);
  await writeCartItem(db.client, "cart", "mug", 3, true);
  await writeCartItem(db.client, "cart", "mug", null, true);
  assert.deepEqual(db.calls.find(call => call.method === "update")?.args, [{ quantity: 3 }]);
  assert.ok(db.calls.some(call => call.method === "delete"));
  await assert.rejects(writeCartItem(db.client, "cart", "mug", 4, true));
  await assert.rejects(writeCartItem(db.client, "cart", "mug", 100, true));
});
test("guest merge combines/caps and checkpoints only durably saved lines", async () => {
  const guest = [{ productId: "mug", quantity: 4 }, { productId: "lamp", quantity: 1 }];
  const committed: string[] = []; const writes: CartItem[] = [];
  const merged = await mergeGuestCart([{ productId: "mug", quantity: 98 }], guest, async item => { writes.push(item); }, id => committed.push(id));
  assert.equal(merged[0].quantity, 99); assert.equal(merged.length, 2); assert.deepEqual(committed, ["mug", "lamp"]); assert.equal(guest.length, 2);
  const pending = [...guest];
  await assert.rejects(mergeGuestCart([], pending, async () => { throw new Error("offline"); }, id => pending.splice(pending.findIndex(item => item.productId === id), 1)));
  assert.deepEqual(pending, guest);
  let count = 0;
  await assert.rejects(mergeGuestCart([], [...pending], async () => { if (++count === 2) throw new Error("offline"); }, id => pending.splice(pending.findIndex(item => item.productId === id), 1)));
  assert.deepEqual(pending, [{ productId: "lamp", quantity: 1 }]);
});
