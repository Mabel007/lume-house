// S04-01/S04-02 regression coverage. jsdom cannot decide computed hit areas or
// breakpoint columns, so these tests parse the authored stylesheet and check the
// markup contracts those selectors bind to. Browser-measured evidence lives in
// .codex/storefront-ux/qa/s04-doc-responsive-first-slice.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles.css", "utf8").replace(/\/\*[^]*?\*\//g, "");
const layout = readFileSync("src/components/Layout.tsx", "utf8");
const footer = readFileSync("src/components/SiteFooter.tsx", "utf8");
const shop = readFileSync("src/features/products/ShopPage.tsx", "utf8");

const closeOf = (text, open) => {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}" && (depth -= 1) === 0) return i;
  }
  throw new Error("unbalanced stylesheet");
};

function parse(text, media = [], from = 0, to = text.length, out = []) {
  let cursor = from;
  while (cursor < to) {
    const open = text.indexOf("{", cursor);
    if (open === -1 || open >= to) break;
    const close = closeOf(text, open);
    if (close > to) break;
    const prelude = text
      .slice(Math.max(cursor, text.lastIndexOf(";", open) + 1), open)
      .trim();
    const body = text.slice(open + 1, close);
    if (/^@(media|supports|keyframes)/.test(prelude))
      parse(text, [...media, prelude], open + 1, close, out);
    else if (prelude)
      out.push({
        prelude,
        body,
        media,
        selectors: prelude.split(",").map((selector) => selector.trim()),
      });
    cursor = close + 1;
  }
  return out;
}

const rules = parse(css);
const rulesFor = (selector) => rules.filter((rule) => rule.selectors.includes(selector));

function assert44Target(selector, context) {
  const found = rulesFor(selector);
  assert.equal(found.length, 1, `${context}: expected one ${selector} rule`);
  for (const [pattern, label] of [
    [/display:\s*inline-flex/, "inline-flex display"],
    [/align-items:\s*center/, "centred content"],
    [/min-height:\s*44px/, "44px minimum height"],
  ])
    assert.match(found[0].body, pattern, `${context}: ${selector} lost its ${label}`);
}

test("header and footer wordmarks keep reachable navigation targets", () => {
  assert44Target(".site-header > .brand", "header");
  assert44Target(".footer-brand > .brand", "footer");
  assert.match(layout, /<Link to="\/" className="brand"/);
  assert.match(footer, /<Link className="brand" to="\/"/);
});

test("footer links and product titles keep reachable navigation targets", () => {
  assert44Target(".footer-links a", "footer navigation");
  assert44Target(".product-card h3 a", "product card");
  assert.match(footer, /<nav className="footer-links" aria-label="Footer navigation">/);
  assert.match(footer, /<li key=\{to\}><Link to=\{to\}>/);
  assert.match(shop, /<article className="product-card"/);
  assert.match(shop, /<h3><Link to=/);
});

function appliesAt(query, width) {
  if (!query.startsWith("@media")) return false;
  const min = query.match(/min-width:\s*(\d+)px/);
  if (min && width < Number(min[1])) return false;
  const max = query.match(/max-width:\s*(\d+)px/);
  if (max && width > Number(max[1])) return false;
  return Boolean(min || max);
}

function declaredAt(selector, property, width) {
  let value;
  for (const rule of rulesFor(selector)) {
    if (!rule.media.every((query) => appliesAt(query, width))) continue;
    const declaration = rule.body.match(
      new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`),
    );
    if (declaration) value = declaration[1].trim();
  }
  return value;
}

function columnCount(value) {
  const repeated = value?.match(/^repeat\((\d+),/);
  if (repeated) return Number(repeated[1]);
  if (value === "minmax(0, 1fr)" || value === "1fr") return 1;
  throw new Error(`unrecognised grid-template-columns: ${value}`);
}

test("catalogue and footer columns hold across the verified viewport set", () => {
  const widths = [320, 375, 390, 768, 1024, 1440];
  const gridColumns = [1, 2, 2, 2, 3, 4];
  const footerColumns = [1, 2, 2, 2, 4, 4];
  widths.forEach((width, index) => {
    assert.equal(
      columnCount(declaredAt(".product-grid", "grid-template-columns", width)),
      gridColumns[index],
      `product grid at ${width}px`,
    );
    assert.equal(
      columnCount(declaredAt(".footer-links", "grid-template-columns", width)),
      footerColumns[index],
      `footer links at ${width}px`,
    );
  });
  assert.match(shop, /<div className="product-grid">/);
});
