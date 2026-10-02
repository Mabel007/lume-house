import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { catalog } from "../src/features/products/catalog.ts";

test("SQL seed exactly matches reviewed local NLE catalog and stable IDs", () => {
  const seed = readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
  const expected = catalog.map((product, index) =>
    "  (" + [
      quote(product.id), quote(product.name), quote(product.description),
      product.price, quote("NLE"), quote(product.image), quote(product.category),
      quote(product.color), index + 1, product.active,
    ].join(", ") + ")",
  );
  const values = seed.split("\nvalues\n")[1].split("\non conflict")[0];
  assert.equal(values, expected.join(",\n"));
  assert.match(seed, /on conflict \(id\) do nothing/);
  assert.doesNotMatch(seed, /'USD'|insert into (?:auth\.|public\.(?:profiles|orders|carts))/i);
  for (const product of catalog) {
    assert.ok(existsSync(new URL("../public" + product.image, import.meta.url)));
  }
});
