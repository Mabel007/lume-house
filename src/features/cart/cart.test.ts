import { test } from "node:test";
import assert from "node:assert/strict";
import { cartReducer, getCartLines, MAX_QUANTITY } from "./cart.ts";

test("adds, combines, updates and removes lines without mutating state", () => {
  const first = cartReducer([], { type: "add", productId: "a" });
  const second = cartReducer(first, { type: "add", productId: "a" });
  assert.equal(first[0].quantity, 1);
  assert.deepEqual(second, [{ productId: "a", quantity: 2 }]);
  const updated = cartReducer(second, {
    type: "quantity",
    productId: "a",
    quantity: 4,
  });
  assert.equal(updated[0].quantity, 4);
  assert.deepEqual(
    cartReducer(updated, { type: "remove", productId: "a" }),
    [],
  );
});
test("rejects invalid quantities and caps repeated additions", () => {
  const state = [{ productId: "a", quantity: MAX_QUANTITY }];
  for (const quantity of [0, -1, 1.5, NaN, Infinity, 100]) {
    assert.equal(
      cartReducer(state, { type: "quantity", productId: "a", quantity }),
      state,
    );
  }
  assert.equal(
    cartReducer(state, { type: "add", productId: "a" })[0].quantity,
    MAX_QUANTITY,
  );
});
test("resolves current catalog prices and omits unavailable products", () => {
  const cart = [
    { productId: "a", quantity: 3 },
    { productId: "missing", quantity: 1 },
  ];
  assert.equal(
    getCartLines(cart, [{ id: "a", price: 1800 }])[0].lineTotal,
    5400,
  );
  const repriced = getCartLines(cart, [{ id: "a", price: 2000 }]);
  assert.equal(repriced.length, 1);
  assert.equal(repriced[0].lineTotal, 6000);
  assert.deepEqual(getCartLines([], []), []);
});
