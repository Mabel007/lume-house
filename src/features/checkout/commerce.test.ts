import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, shop } from "../../config/shop.ts";
import {
  deliveryConfig,
  getDeliveryFee,
  getDeliveryFeeForCountry,
} from "../../config/fulfilment.ts";
import { countries, findCountry, searchCountries } from "../../config/countries.ts";
import {
  getPaymentPhone,
  invalidPhoneMessage,
  normalizePhone,
  validatePaymentPhone,
} from "./payment.ts";
import { catalog } from "../products/catalog.ts";
import { getCartLines } from "../cart/cart.ts";
import { checkoutMessages, cityProblem, countryProblem, isValidEmail } from "./validation.ts";
test("NLE formatting uses consistent NLE and integer minor units", () => {
  assert.equal(formatMoney(45000), "NLE 450");
  assert.equal(formatMoney(125000), "NLE 1,250");
  assert.equal(formatMoney(45050), "NLE 450.50");
  assert.equal(formatMoney(0), "NLE 0");
  assert.throws(() => formatMoney(1.5));
});
test("20 active local pieces have unique stable IDs and NLE minor prices", () => {
  assert.equal(shop.currency, "NLE");
  assert.equal(catalog.length, 20);
  assert.equal(new Set(catalog.map((p) => p.id)).size, 20);
  for (const p of catalog) {
    assert.ok(p.active);
    assert.match(p.id, /^[a-z0-9-]+$/);
    assert.ok(Number.isSafeInteger(p.price));
    assert.ok(p.price > 0);
    assert.ok(p.image.startsWith("/images/"));
  }
  const lines = getCartLines(
    [
      { productId: "amber-candle", quantity: 2 },
      { productId: "table-lamp", quantity: 1 },
    ],
    catalog,
  );
  assert.equal(
    lines.reduce((sum, line) => sum + line.lineTotal, 0),
    175000,
  );
  assert.equal(
    getCartLines(
      [{ productId: "amber-candle", quantity: 2 }],
      catalog.map((p) => ({ ...p, price: 30000 })),
    )[0].lineTotal,
    60000,
  );
});
test("three provisional zones, supported city and pickup calculate safely", () => {
  assert.deepEqual(
    deliveryConfig.zones.filter((z) => z.active).map((z) => [z.id, z.fee]),
    [
      ["zone-1", 4000],
      ["zone-2", 5000],
      ["zone-3", 6000],
    ],
  );
  for (const [id, fee] of [
    ["zone-1", 4000],
    ["zone-2", 5000],
    ["zone-3", 6000],
  ] as const)
    assert.equal(getDeliveryFee("delivery", " Freetown ", id), fee);
  assert.equal(getDeliveryFee("pickup", "", ""), 0);
  for (const [city, id] of [
    ["Freetown", ""],
    ["Freetown", "zone-4"],
    ["Bo", "zone-1"],
    ["", "zone-1"],
  ])
    assert.equal(getDeliveryFee("delivery", city, id), null);
  assert.equal(
    getDeliveryFee("delivery", "Freetown", "zone-1", {
      ...deliveryConfig,
      zones: [{ ...deliveryConfig.zones[0], active: false }],
    }),
    null,
  );
  assert.equal(
    getDeliveryFee("delivery", "Freetown", "zone-1", {
      ...deliveryConfig,
      zones: [{ ...deliveryConfig.zones[0], fee: -1 }],
    }),
    null,
  );
  assert.equal(
    150000 + getDeliveryFee("delivery", "Freetown", "zone-2")!,
    155000,
  );
});
test("country selector lists standardized countries and defaults to Sierra Leone", () => {
  assert.equal(deliveryConfig.serviceCountry, "Sierra Leone");
  assert.equal(deliveryConfig.serviceCountryCode, "SL");
  assert.equal(countries.length, 249);
  assert.equal(new Set(countries.map((country) => country.code)).size, 249);
  for (const code of ["SL", "GH", "NG", "GN", "LR"])
    assert.ok(findCountry(code), `${code} is available`);
  assert.equal(findCountry("SL")?.name, "Sierra Leone");
  assert.equal(findCountry("GH")?.name, "Ghana");
  assert.equal(countryProblem("SL", deliveryConfig.serviceCountryCode), undefined);
  assert.equal(
    countryProblem("", deliveryConfig.serviceCountryCode),
    checkoutMessages.country,
  );
  assert.equal(
    countryProblem("GH", deliveryConfig.serviceCountryCode),
    checkoutMessages.unsupportedCountry,
  );
});
test("country search filters by name without diacritics or case", () => {
  assert.deepEqual(
    searchCountries("ghana").map((country) => country.code),
    ["GH"],
  );
  assert.deepEqual(
    searchCountries("COTE").map((country) => country.code),
    ["CI"],
  );
  assert.deepEqual(
    searchCountries("  guinea  ").map((country) => country.code),
    ["GN", "GW", "GQ", "PG"],
  );
  assert.deepEqual(
    searchCountries("ni").slice(0, 4).map((country) => country.code),
    ["NI", "NE", "NG", "NU"],
  );
  assert.deepEqual(
    searchCountries("guinea bissau").map((country) => country.code),
    ["GW"],
  );
  assert.deepEqual(
    searchCountries("congo democratic").map((country) => country.code),
    ["CD"],
  );
  assert.equal(searchCountries(" ").length, countries.length);
  assert.deepEqual(searchCountries("not a country"), []);
});
test("common country aliases resolve to canonical entries and rank first", () => {
  const aliases = [
    ["UK", "GB"],
    ["USA", "US"],
    ["US", "US"],
    ["Turkey", "TR"],
    ["South Korea", "KR"],
    ["North Korea", "KP"],
    ["Republic of Korea", "KR"],
    ["Democratic People's Republic of Korea", "KP"],
    ["Vietnam", "VN"],
    ["Ivory Coast", "CI"],
  ] as const;
  for (const [query, code] of aliases) {
    const results = searchCountries(query);
    assert.equal(results[0]?.code, code, `${query} ranks its canonical country first`);
    assert.equal(results[0], findCountry(code), `${query} uses the canonical entry`);
    assert.equal(
      new Set(results.map((country) => country.code)).size,
      results.length,
      `${query} returns no duplicate countries`,
    );
  }
  const uk = searchCountries("UK").map((country) => country.code);
  assert.equal(uk[0], "GB");
  assert.ok(uk.includes("UA"), "Ukraine remains searchable after the UK alias");
  assert.equal(searchCountries("u.s.a.")[0]?.code, "US");
  assert.equal(searchCountries("iVoRy CoAsT")[0]?.code, "CI");
  assert.equal(countries.length, 249);
});
test("delivery fees require Sierra Leone while pickup stays free for any selection", () => {
  assert.equal(getDeliveryFeeForCountry("delivery", "SL", "Freetown", "zone-1"), 4000);
  assert.equal(getDeliveryFeeForCountry("delivery", "GH", "Freetown", "zone-1"), null);
  assert.equal(getDeliveryFeeForCountry("delivery", "", "Freetown", "zone-1"), null);
  assert.equal(getDeliveryFeeForCountry("pickup", "GH", "", ""), 0);
  assert.equal(getDeliveryFeeForCountry("pickup", "", "", ""), 0);
});
test("normalizes reasonable Sierra Leone typing formats", () => {
  for (const value of [
    "+232 76 521208",
    "0023276521208",
    "23276521208",
    "076521208",
    "76521208",
    "(+232) 76-521208",
  ])
    assert.equal(normalizePhone(value), "+23276521208");
  assert.notEqual(normalizePhone("+23276abc521208"), "+23276521208");
});
test("payment format allows non-exhaustive ranges without provider claims", () => {
  for (const value of [
    "+23276521208",
    "+23288790011",
    "+23230521208",
    "+23290521208",
    "+23277521208",
    "+23231521208",
  ])
    assert.equal(validatePaymentPhone(value), null);
  for (const value of [
    "+2327652120",
    "+232765212080",
    "",
    "+23376521208",
    "0023376521208",
    "0276521208",
    "+232076521208",
    "+23276abc521208",
  ])
    assert.ok(validatePaymentPhone(value));
});
test("phone guidance stays network-neutral with a shared masked message", () => {
  assert.equal(
    invalidPhoneMessage,
    "Enter a valid 8-digit Sierra Leone phone number.",
  );
  assert.doesNotMatch(invalidPhoneMessage, /Orange|\+232\d/i);
  for (const value of [
    "76521208",
    "076521208",
    "+23276521208",
    "0023276521208",
    "23276521208",
    "+232 88 790011",
    "031521208",
    "(+232) 77-521208",
  ])
    assert.equal(validatePaymentPhone(value), null);
  for (const value of [
    "7652120",
    "765212080",
    "+23376521208",
    "0023376521208",
    "0276521208",
    "+232076521208",
    "+23276abc521208",
    "",
    "   ",
  ])
    assert.equal(validatePaymentPhone(value), invalidPhoneMessage);
});
test("contact reuse derives synchronized input and preserves independent payer", () => {
  const independent = "+23288790011";
  assert.equal(
    getPaymentPhone("+23276521208", independent, true),
    "+23276521208",
  );
  assert.equal(
    getPaymentPhone("+23290521208", independent, true),
    "+23290521208",
  );
  assert.equal(
    getPaymentPhone("+23290521208", independent, false),
    independent,
  );
  for (const missing of ["", "invalid"])
    assert.ok(
      validatePaymentPhone(getPaymentPhone(missing, independent, true)),
    );
});
test("checkout city validation mirrors the trusted Freetown-only rule", () => {
  assert.equal(cityProblem("Freetown", "Freetown"), undefined);
  assert.equal(cityProblem("  freetown  ", "Freetown"), undefined);
  assert.equal(cityProblem("", "Freetown"), checkoutMessages.city);
  assert.equal(cityProblem("   ", "Freetown"), checkoutMessages.city);
  assert.equal(
    cityProblem("Bo", "Freetown"),
    checkoutMessages.unsupportedCity,
  );
});
test("checkout email check accepts native-shaped addresses and rejects malformed input", () => {
  for (const value of [
    "customer@example.com",
    "a.b+tag@sub.example.co",
    "  customer@example.com  ",
  ])
    assert.equal(isValidEmail(value), true);
  for (const value of [
    "",
    "   ",
    "customer",
    "customer@example",
    "customer@ example.com",
    "@example.com",
    "customer@.com",
    "customer @example.com",
  ])
    assert.equal(isValidEmail(value), false);
});
