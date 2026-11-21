// B1 guards the cascade, not the presence of a string. The defect it protects against
// was invisible to a text search: `.button.secondary` and `.button.destructive` both
// exist, both read correctly, and both are overridden on hover by a rule that never
// names them, because `.button:hover:not(:disabled)` carries one more class-level
// selector than either. So these tests resolve which declaration actually wins for a
// described element and state, then assert on that winner.
//
// Scope, stated honestly: this models the author stylesheets only. Tailwind preflight
// arrives through `@import "tailwindcss"` at styles.css:1 and is not in the source text,
// so absolute computed values remain browser evidence. What is proven here is the
// relative outcome between author rules, which is what B1 changed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Later sheet wins an equal-specificity tie: main.tsx import order.
const SHEETS = ["styles", "typography", "refinement", "motion"];

const closeOf = (css, open) => {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}" && (depth -= 1) === 0) return i;
  }
  throw new Error("unbalanced stylesheet");
};

function parse(css, ancestry, out, from = 0, to = css.length) {
  let cursor = from;
  while (cursor < to) {
    const open = css.indexOf("{", cursor);
    if (open === -1 || open >= to) break;
    const close = closeOf(css, open);
    if (close > to) break;
    const prelude = css.slice(Math.max(cursor, css.lastIndexOf(";", open) + 1), open).trim();
    if (/^@keyframes/.test(prelude)) {
      cursor = close + 1; // keyframe percentages are not selectors
      continue;
    }
    if (/^@(media|supports|layer)/.test(prelude))
      parse(css, [...ancestry, prelude], out, open + 1, close);
    else if (prelude && !prelude.startsWith("@"))
      out.push({ prelude, body: css.slice(open + 1, close), ancestry });
    cursor = close + 1;
  }
  return out;
}

const cache = new Map();
const rulesFor = (sheet) => {
  if (!cache.has(sheet))
    cache.set(sheet, parse(readFileSync(`src/${sheet}.css`, "utf8").replace(/\/\*[^]*?\*\//g, ""), [], []));
  return cache.get(sheet);
};

const isColorToken = (t) => /^(#|var\(|rgb|rgba|hsl|hsla|color-mix|currentcolor|transparent|white|black)/i.test(t);

// `border` and `outline` shorthands also set their longhands.
function declarations(body) {
  const out = [];
  for (const part of body.split(";")) {
    const i = part.indexOf(":");
    if (i === -1) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim();
    if (!prop || !value) continue;
    out.push({ prop, value });
    if (prop === "border" || prop === "border-color" || prop === "border-top" || prop === "border-bottom") {
      const colour = value.split(/\s+/).find(isColorToken);
      if (colour) out.push({ prop: "border-color", value: colour });
      const width = value.split(/\s+/).find((t) => /^\d|^thin|^medium|^thick/.test(t) && !isColorToken(t));
      if (width && prop.startsWith("border")) out.push({ prop: "border-width", value: width });
    }
    if (prop === "outline") {
      const style = value.split(/\s+/).find((t) => /^(none|solid|dashed|dotted|double|groove|ridge|inset|outset|auto)$/.test(t));
      if (style) out.push({ prop: "outline-style", value: style });
    }
  }
  return out;
}

// (ids, class-level, type-level). `:not()`/`:is()`/`:has()` contribute their argument's
// weight and themselves nothing; `:where()` contributes nothing at all.
function specificity(selector) {
  let ids = 0;
  let classes = 0;
  let types = 0;
  const s = selector.trim();
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "#") { ids += 1; i += /^#[\w-]+/.exec(s.slice(i))[0].length; continue; }
    if (ch === ".") { classes += 1; i += /^\.[\w-]+/.exec(s.slice(i))[0].length; continue; }
    if (ch === "[") { classes += 1; i += /^\[[^\]]*\]/.exec(s.slice(i))[0].length; continue; }
    if (ch === ":") {
      if (s[i + 1] === ":") { types += 1; i += /^::[\w-]+/.exec(s.slice(i))[0].length; continue; }
      const functional = /^:(not|is|has|where|any|matches)\(([^)]*)\)/.exec(s.slice(i));
      if (functional) {
        if (functional[1] !== "where") {
          const inner = functional[2]
            .split(",")
            .map(specificity)
            .reduce((best, x) => (cmp(x, best) > 0 ? x : best), { ids: 0, classes: 0, types: 0 });
          ids += inner.ids;
          classes += inner.classes;
          types += inner.types;
        }
        i += functional[0].length;
        continue;
      }
      const bare = /^:[\w-]+/.exec(s.slice(i));
      classes += 1;
      i += bare[0].length;
      continue;
    }
    if (ch === "*") { i += 1; continue; }
    if (ch === ">") { i += 1; continue; }
    if (/[\w-]/.test(ch)) { types += 1; i += /^[\w-]+/.exec(s.slice(i))[0].length; continue; }
    i += 1;
  }
  return { ids, classes, types };
}
const cmp = (a, b) => a.ids - b.ids || a.classes - b.classes || a.types - b.types;

function compoundParts(compound) {
  const parts = [];
  let i = 0;
  while (i < compound.length) {
    const m = /^(\.[\w-]+|#[\w-]+|\[[^\]]*\]|::[\w-]+|:[\w-]+(?:\([^)]*\))?|\*|[a-zA-Z][\w-]*)/.exec(compound.slice(i));
    if (!m) return null;
    parts.push(m[0]);
    i += m[0].length;
  }
  return parts.length ? parts : null;
}

function compoundMatches(compound, element) {
  const parts = compoundParts(compound);
  if (!parts) return false;
  for (const part of parts) {
    if (part === "*") continue;
    if (part[0] === ".") { if (!element.classes.includes(part.slice(1))) return false; continue; }
    if (part[0] === "#") { if (element.id !== part.slice(1)) return false; continue; }
    if (part[0] === "[") {
      const m = /^\[([\w-]+)(?:\s*=\s*"?([^\]"]*)"?)?\]/.exec(part);
      const actual = element.attrs[m[1]];
      if (actual === undefined) return false;
      if (m[2] !== undefined && String(actual) !== m[2]) return false;
      continue;
    }
    if (part[0] === ":") {
      if (part.startsWith("::")) return false;
      const negated = /^:not\(([^)]*)\)/.exec(part);
      if (negated) { if (negated[1].split(",").some((s) => compoundMatches(s.trim(), element))) return false; continue; }
      const grouped = /^:(?:is|matches|any)\(([^)]*)\)/.exec(part);
      if (grouped) { if (!grouped[1].split(",").some((s) => compoundMatches(s.trim(), element))) return false; continue; }
      if (/^:where/.test(part)) continue;
      const name = /^:([\w-]+)/.exec(part)[1];
      if (name === "disabled") { if (!element.states.has("disabled")) return false; continue; }
      if (["hover", "focus", "focus-visible", "focus-within", "active"].includes(name)) {
        if (!element.states.has(name)) return false;
        continue;
      }
      return false; // unmodelled pseudo-class: never claim a match
    }
    if (/^[a-zA-Z]/.test(part)) { if (element.tag.toLowerCase() !== part.toLowerCase()) return false; continue; }
    return false;
  }
  return true;
}

function selectorMatches(selector, element) {
  const s = selector.trim();
  if (!s || s.startsWith("@") || s.includes("%")) return false;
  const compounds = s.split(/\s+/).filter(Boolean);
  const subject = compounds.pop();
  if (!compoundMatches(subject, element)) return false;
  // Remaining compounds must match the ancestor chain, nearest-first, in order.
  const needed = compounds.filter((c) => c !== ">").reverse();
  if (!needed.length) return true;
  let index = 0;
  for (const ancestor of element.ancestors || []) {
    if (compoundMatches(needed[index], ancestor)) {
      index += 1;
      if (index === needed.length) return true;
    }
  }
  return needed.length === 0;
}

// Cascade order: unlayered beats layered, then specificity, then sheet and source order.
function resolve(property, element, { media } = {}) {
  const candidates = [];
  SHEETS.forEach((sheet, sheetRank) => {
    rulesFor(sheet).forEach((rule, order) => {
      const guarded = rule.ancestry.filter((p) => p.startsWith("@media") || p.startsWith("@supports"));
      // With no media requested only unguarded rules apply; with one requested, exactly
      // one guard that matches. Nested guards are out of scope and always skipped.
      if (guarded.length !== (media ? 1 : 0)) return;
      if (media && !guarded[0].includes(media)) return;
      for (const selector of rule.prelude.split(",").map((part) => part.trim())) {
        if (!selectorMatches(selector, element)) continue;
        const found = declarations(rule.body).filter((d) => d.prop === property).pop();
        if (!found) continue;
        candidates.push({
          sheet,
          sheetRank,
          order,
          selector,
          spec: specificity(selector),
          value: found.value,
          layered: rule.ancestry.some((p) => p.startsWith("@layer")),
        });
      }
    });
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.layered !== b.layered) return a.layered ? 1 : -1;
    const bySpec = cmp(b.spec, a.spec);
    if (bySpec) return bySpec;
    if (a.sheetRank !== b.sheetRank) return b.sheetRank - a.sheetRank;
    return b.order - a.order;
  });
  return candidates[0];
}

const chain = (...classSets) =>
  classSets.map((classes) => ({ classes, tag: "div", id: undefined, attrs: {}, states: new Set(), ancestors: [] }));

// The last unlayered `:root` declaration of a custom property, which is what the
// browser computes for every `var()` that consumes it. Slice C/D replaced literal
// colours and radii with the Slice A tokens, so a test that only reads the
// declaration would pass even if a token were retuned; these assertions read both.
function rootRule(name) {
  for (const sheet of SHEETS) {
    for (const rule of rulesFor(sheet)) {
      if (rule.ancestry.length) continue;
      if (!rule.prelude.split(",").map((s) => s.trim()).includes(":root")) continue;
      const found = declarations(rule.body).filter((d) => d.prop === name).pop();
      if (found) return found.value;
    }
  }
  return null;
}

// Asserts a declaration is the token and that the token still stands for the
// approved value. `expected` is the token, `hex` the value it must resolve to.
function assertToken(name, hex) {
  assert.equal(rootRule(name), hex, `${name} must still resolve to the approved value`);
}

const control = (tag, classes, states) => ({
  tag,
  classes,
  id: undefined,
  attrs: {},
  states: new Set(states),
  ancestors: chain(["site-header"], ["main"]),
});

const PRIMARY_HOVER_GREEN = "#405343";

// ---------------------------------------------------------------------------
// Self-validation. Every expectation here was measured in a live browser against
// the compiled bundle before this file was written. A resolver that cannot
// reproduce them is broken, and a broken resolver must not report a pass.
// ---------------------------------------------------------------------------
test("the cascade resolver reproduces browser-measured outcomes", () => {
  assert.equal(resolve("background", control("button", ["button"], [])).value, "#2d4033", "primary rest fill");
  assert.equal(
    resolve("background", control("button", ["button"], ["hover"])).value,
    PRIMARY_HOVER_GREEN,
    "primary hover is the later duplicate rule, not the dead #435944",
  );
  assert.equal(
    resolve("font-size", control("button", ["button"], [])).value,
    "var(--type-functional)",
    "typography.css wins the 12px tie by load order, matching the measured 16px",
  );
  assert.equal(
    resolve("min-height", control("button", ["button"], [])).value,
    "46px",
    "refinement.css wins the 49px tie, matching the measured 46px",
  );
  assert.equal(
    resolve("gap", control("button", ["button"], [])).value,
    ".5rem",
    "refinement.css wins the 32px tie, matching the measured 8px",
  );
  const filter = control("button", [], []);
  filter.ancestors = chain(["filters"]);
  // Mobile: 48px from styles.css @media (max-width: 700px); Desktop: 44px from refinement.css @media (min-width: 701px)
  assert.equal(resolve("min-height", filter, { media: "(max-width: 700px)" })?.value, "48px", "mobile filters min-height is 48px");
  assert.equal(resolve("min-height", filter, { media: "(min-width: 701px)" })?.value, "44px", "desktop filters min-height is 44px");
  assert.equal(resolve("background", control("button", ["button", "secondary"], [])).value, "transparent", "secondary at rest");
});

// ---------------------------------------------------------------------------
// B1-01 secondary hover
// ---------------------------------------------------------------------------
test("B1-01 secondary hover owns its own fill and hairline treatment", () => {
  const hover = control("button", ["button", "secondary"], ["hover"]);
  const bg = resolve("background", hover);
  assert.equal(bg.selector, ".button.secondary:hover:not(:disabled)", "the variant rule is the winner");
  assert.equal(bg.value, "transparent", "secondary hover stays transparent");
  const edge = resolve("border-color", hover);
  assert.equal(edge.selector, ".button.secondary:hover:not(:disabled)", "the variant rule wins the hairline too");
  assert.equal(edge.value, "var(--border-strong)", "hover uses the existing strong hairline token");
});

test("B1-01 secondary hover outranks the generic rule that caused the defect", () => {
  const hover = control("button", ["button", "secondary"], ["hover"]);
  const winner = resolve("background", hover);
  assert.ok(
    cmp(winner.spec, specificity(".button:hover:not(:disabled)")) > 0,
    "the variant must outrank the generic hover rule",
  );
  assert.notEqual(winner.value, PRIMARY_HOVER_GREEN);
  // No author rule that matches a hovered secondary may paint it with the primary fill.
  for (const sheet of SHEETS) {
    for (const rule of rulesFor(sheet)) {
      for (const selector of rule.prelude.split(",").map((part) => part.trim())) {
        if (selector === ".button:hover:not(:disabled)") continue; // the known loser
        if (!selectorMatches(selector, hover)) continue;
        for (const d of declarations(rule.body)) {
          if (d.prop !== "background") continue;
          assert.notEqual(d.value, PRIMARY_HOVER_GREEN, `${sheet}: ${selector} would paint secondary green`);
        }
      }
    }
  }
});

test("B1-01 secondary rest, text colour and metrics are untouched", () => {
  const rest = control("button", ["button", "secondary"], []);
  assert.equal(resolve("color", rest).value, "var(--color-ink)", "ink label preserved");
  assert.equal(resolve("min-height", rest).value, "46px", "height preserved");
  assert.equal(resolve("border-radius", rest).value, "var(--radius-control)", "radius preserved through the Slice A token");
  assertToken("--radius-control", "0.35rem");
  assert.equal(resolve("padding", rest).value, "16px 23px", "padding preserved");
  assert.equal(resolve("border-color", rest).value, "var(--ui-border)", "rest border unchanged");
  assert.equal(resolve("box-shadow", rest).value, "0 2px 0 #1e302719", "rest shadow unchanged");
});

// ---------------------------------------------------------------------------
// B1-02 destructive hover
// ---------------------------------------------------------------------------
test("B1-02 destructive hover retains the existing red fill", () => {
  const hover = control("button", ["button", "destructive"], ["hover"]);
  const bg = resolve("background", hover);
  assert.equal(bg.selector, ".button.destructive:hover:not(:disabled)", "the variant rule wins");
  assert.equal(bg.value, "var(--danger-action)", "the approved token, not a new colour");
  assert.notEqual(bg.value, PRIMARY_HOVER_GREEN, "destructive must not turn primary green");
  const rest = control("button", ["button", "destructive"], []);
  assert.equal(resolve("background", rest).value, "var(--danger-action)", "rest fill now names the token the hover rule already uses");
  assertToken("--danger-action", "#783a2e");
  assert.equal(resolve("color", rest).value, "#fff", "label stays white at rest");
  assert.equal(resolve("color", hover).value, "#fff", "label stays white on hover");
});

test("B1-02 destructive hover keeps the shared lift and the keyboard ring", () => {
  const hover = control("button", ["button", "destructive"], ["hover"]);
  assert.equal(
    resolve("box-shadow", hover).value,
    resolve("box-shadow", control("button", ["button"], ["hover"])).value,
    "the hover shadow is inherited, not redefined",
  );
  assert.equal(
    resolve("outline", control("button", ["button", "destructive"], ["focus-visible"])).value,
    "3px solid #9a542e",
    "the page-wide keyboard ring still applies",
  );
});

// ---------------------------------------------------------------------------
// B1-03 account-menu keyboard focus
// ---------------------------------------------------------------------------
const popoverItem = (tag, states) => ({
  tag,
  classes: [],
  id: undefined,
  attrs: {},
  states: new Set(states),
  ancestors: chain(["account-menu-popover"], ["account-menu"], ["main-nav"], ["site-header"]),
});

test("B1-03 account-menu focus is not suppressed", () => {
  for (const tag of ["a", "button"]) {
    const focused = popoverItem(tag, ["focus-visible"]);
    const outline = resolve("outline", focused);
    assert.equal(outline.selector, ":focus-visible", `${tag}: the global contract is the winner`);
    assert.equal(outline.value, "3px solid #9a542e", `${tag}: the amber ring applies`);
    assert.equal(resolve("outline-offset", focused).value, "4px", `${tag}: the standard offset applies`);
    for (const sheet of SHEETS) {
      for (const rule of rulesFor(sheet)) {
        for (const selector of rule.prelude.split(",").map((part) => part.trim())) {
          if (!selectorMatches(selector, focused)) continue;
          for (const d of declarations(rule.body)) {
            if (d.prop !== "outline" && d.prop !== "outline-style") continue;
            assert.doesNotMatch(d.value, /\b(none|0)\b/, `${sheet}: ${selector} still suppresses the ring`);
          }
        }
      }
    }
  }
});

test("B1-03 pointer hover keeps the pale fill and gains no ring", () => {
  const hovered = popoverItem("button", ["hover"]);
  assert.equal(resolve("background", hovered).value, "#eaeade", "the hover fill is preserved");
  assert.equal(resolve("outline", hovered), null, "hover alone declares no outline");
});

test("B1-03 the menu trigger keeps its own ring", () => {
  const trigger = {
    tag: "button",
    classes: ["header-account"],
    id: undefined,
    attrs: {},
    states: new Set(["focus-visible"]),
    ancestors: chain(["account-menu"], ["main-nav"], ["site-header"]),
  };
  assert.equal(resolve("outline", trigger).value, "3px solid #9a542e", "the trigger was never broken");
});

// ---------------------------------------------------------------------------
// The global keyboard contract
// ---------------------------------------------------------------------------
test("the global keyboard focus contract remains intact", () => {
  const focused = control("button", ["button"], ["focus-visible"]);
  assert.equal(resolve("outline", focused).value, "3px solid #9a542e");
  assert.equal(resolve("outline", focused).selector, ":focus-visible");
  assert.equal(resolve("outline-offset", focused).value, "4px");
  assert.equal(
    resolve("outline", control("main", [], ["focus"])).value,
    "none",
    "the deliberate main:focus suppression is untouched",
  );
});

test("the tokens B1 depends on still resolve to their approved values", () => {
  assert.equal(rootRule("--border-strong"), "#c8cdbc");
  assert.equal(rootRule("--danger-action"), "#783a2e");
  assert.equal(rootRule("--focus-accent"), "#9a542e");
  assert.equal(rootRule("--color-selected"), "#2d4033");
  assert.equal(rootRule("--ui-border"), "#dcded3");
});

// ---------------------------------------------------------------------------
// B2-01 customer text-input heights
// Same scope note as the header: this models the author stylesheets, so the
// absolute pixel height stays browser evidence. What is proven here is which
// min-height declaration wins, which is what the correction changed.
// ---------------------------------------------------------------------------
const field = (tag, attrs, ...classSets) => ({
  tag,
  classes: [],
  id: undefined,
  attrs,
  states: new Set(),
  ancestors: chain(...classSets),
});

test("B2-01 the 44px floor no longer caps the checkout text input", () => {
  const checkout = resolve("min-height", field("input", { type: "text" }, ["form-grid"]));
  assert.equal(checkout.value, "48px", "the approved minimum applies, not the 46px the family declares");
  assert.equal(checkout.sheet, "refinement");
  assert.equal(
    checkout.selector,
    '.form-grid input:not([type=checkbox]):not([type=radio])',
    "the carve-out is the winner",
  );
  assert.ok(
    cmp(checkout.spec, specificity("input:not([type=checkbox]):not([type=radio])")) > 0,
    "it must outrank the floor rather than tie it and rely on source order",
  );
});

test("B2-01 the saved-address text input keeps its own 48px", () => {
  const addressInput = resolve("min-height", field("input", { type: "text" }, ["form-field"], ["address-form"]));
  assert.equal(addressInput.value, "48px", "the declared height survives instead of collapsing to the floor");
  assert.equal(addressInput.selector, ".form-field input[type=text]");
});

test("B2-01 the country combobox inherits the checkout specification", () => {
  const combobox = resolve("min-height", field("input", { type: "text" }, ["country-control"], ["country-field"], ["form-grid"]));
  assert.equal(combobox.value, "48px", "the combobox sits inside .form-grid, so its 46px is superseded consistently");
});

test("B2-01 both input families get the same line-height and font-size", () => {
  const checkoutField = field("input", { type: "text" }, ["form-grid"]);
  const addressField = field("input", { type: "text" }, ["form-field"], ["address-form"]);
  const checkout = resolve("line-height", checkoutField);
  const address = resolve("line-height", addressField);
  assert.equal(checkout.value, "1.5");
  assert.equal(address.value, "1.5", "saved-address inputs are covered by the form typography contract");
  assert.equal(address.sheet, "typography");
  assert.equal(
    resolve("font-size", addressField).value,
    resolve("font-size", checkoutField).value,
    "equal heights must not come from different type sizes",
  );
});

test("B2-01 selects, checkboxes and radios are untouched by the carve-out", () => {
  const checkoutSelect = resolve("min-height", field("select", {}, ["form-grid"]));
  assert.equal(checkoutSelect.value, "48px", "select minimum still comes from its own rule");
  assert.equal(checkoutSelect.selector, ".form-grid select");
  assert.equal(resolve("min-height", field("select", {}, ["form-field"], ["address-form"])).value, "48px");
  assert.equal(
    resolve("line-height", field("select", {}, ["form-field"], ["address-form"])),
    null,
    "the typography change did not reach selects",
  );
  const reuse = resolve("min-height", field("input", { type: "checkbox" }, ["phone-reuse"], ["form-grid"]));
  assert.equal(reuse.value, "18px", "the phone-reuse checkbox keeps its own box");
  assert.equal(reuse.selector, ".form-grid .phone-reuse input");
  assert.equal(resolve("min-height", field("input", { type: "radio" }, ["saved-address-option"])), null);
});

test("B2-01 controls outside the customer form families still fall to the floor", () => {
  const search = resolve("min-height", field("input", { type: "search" }, ["search-field"], ["product-search"]));
  assert.equal(search.value, "44px", "the search input keeps the floor, as measured before this change");
  const filters = resolve("min-height", field("input", { type: "text" }, ["admin-order-filters"], ["admin-workspace"]));
  assert.equal(filters.value, "44px", "admin filters keep the floor rather than taking the customer specification");
});

// ---------------------------------------------------------------------------
// B2-02 the invalid edge for saved-address inputs
// Measured before this correction: an invalid address input showed the shared
// halo but no border change at all, because styles.css re-declares the `border`
// shorthand on `.form-field input[type="text"]` at higher specificity than the
// shared `[aria-invalid]` rule. Its sibling select already rendered #8c392c.
// ---------------------------------------------------------------------------
const invalidAddressInput = () =>
  field("input", { type: "text", "aria-invalid": "true" }, ["form-field"], ["address-form"]);

test("B2-02 an invalid saved-address input shows the edge its select already shows", () => {
  const edge = resolve("border-color", invalidAddressInput());
  assert.equal(edge.value, "var(--danger-edge)", "the shared danger edge, the same ink the address select renders");
  assertToken("--danger-edge", "#8c392c");
  assert.equal(edge.sheet, "refinement");
  assert.equal(edge.selector, '.address-form .form-field input[aria-invalid="true"]');
  assert.ok(
    cmp(edge.spec, specificity('.form-field input[type="text"]')) > 0,
    "it must outrank the shorthand rather than tie it and depend on sheet order",
  );
});

test("B2-02 the halo and the restored edge are the same red, and only when invalid", () => {
  assert.equal(resolve("box-shadow", invalidAddressInput()).value, "0 0 0 1px var(--danger-edge)", "shared invalid halo, same token as the edge");
  const rest = resolve("border-color", field("input", { type: "text" }, ["form-field"], ["address-form"]));
  assert.equal(rest.sheet, "styles", "the resting address edge still comes from its own family rule");
  assert.ok(rest.value.startsWith("var(--surface-border"), "the fix is conditional on aria-invalid");
});

test("D2 checkout's save-address label now gets the edge its own halo already paints", () => {
  // B2-02 pinned this field as still losing its edge; Slice D is the brief that
  // authorises resolving it. The ink is not new: refinement.css already draws this
  // control's halo in --danger-edge, so the edge and the halo no longer disagree.
  const saveAddressLabel = resolve(
    "border-color",
    field("input", { type: "text", "aria-invalid": "true" }, ["form-field"], ["save-address-section"], ["fulfilment-panel"]),
  );
  assert.equal(saveAddressLabel.sheet, "refinement");
  assert.equal(saveAddressLabel.selector, '.save-address-section .form-field input[aria-invalid="true"]');
  assert.equal(saveAddressLabel.value, "var(--danger-edge)");
  assert.equal(
    resolve("box-shadow", field("input", { type: "text", "aria-invalid": "true" }, ["form-field"], ["save-address-section"])).value,
    "0 0 0 1px var(--danger-edge)",
    "edge and halo are the same ink",
  );
  assert.ok(
    cmp(saveAddressLabel.spec, specificity('.form-field input[type="text"]')) > 0,
    "it outranks the family shorthand on its own specificity, as the address-form fix does",
  );
  // A resting save-address field must keep its own hairline: the rule is conditional.
  const rest = resolve("border-color", field("input", { type: "text" }, ["form-field"], ["save-address-section"]));
  assert.ok(rest.value.startsWith("var(--surface-border"), "the edge only appears when aria-invalid is set");
});

test("D2 the checkout .form-grid invalid ink is unchanged, it is still an owner decision", () => {
  // styles.css records #9a542e as the focus/error conflation reserved for the owner.
  // Slice D names it in the handoff and does not silently recolour it.
  const checkout = resolve("border-color", field("input", { type: "text", "aria-invalid": "true" }, ["form-grid"]));
  assert.equal(checkout.value, "#9a542e", "still the literal, not adopted as a danger token");
  assert.equal(checkout.selector, '.form-grid input[aria-invalid="true"]');
});

test("B2-02 the correction did not become global validation styling", () => {
  const admin = resolve("border-color", field("input", { type: "text", "aria-invalid": "true" }, ["admin-screen"]));
  assert.equal(admin.selector, 'input[aria-invalid="true"]', "uncorrelated inputs still resolve to the input-only rule");
  assert.equal(admin.value, "var(--danger-edge-input)", "which is live outside the compound form families, so it is not dead code");
  assertToken("--danger-edge-input", "#9b4037");
  const search = resolve("border-color", field("input", { type: "search", "aria-invalid": "true" }, ["search-field"]));
  assert.equal(search.selector, 'input[aria-invalid="true"]');
  const addressSelect = resolve("border-color", field("select", { "aria-invalid": "true" }, ["form-field"], ["address-form"]));
  assert.equal(addressSelect.value, "var(--danger-edge)", "the select was already correct, and the input now matches it");
  assert.equal(addressSelect.selector, "select[aria-invalid=true]");
});

test("B2-02 the address error copy inherits the established error text styling", () => {
  const message = {
    tag: "p",
    classes: ["field-error"],
    id: undefined,
    attrs: {},
    states: new Set(),
    ancestors: chain(["form-field"], ["address-form"]),
  };
  assert.equal(resolve("color", message).value, "var(--danger-text)", "--danger-text, the same ink checkout field errors use");
  assertToken("--danger-text", "#8a4628");
  assert.equal(resolve("font-size", message).value, "var(--type-meta)");
});

// ---------------------------------------------------------------------------
// B3 narrow disabled affordance and the address-form choice target. The rules
// are scoped to the three customer form families; admin, search and read-only
// controls must keep resolving exactly as before.
// ---------------------------------------------------------------------------
const disabledText = (...classSets) => {
  const element = field("input", { type: "text" }, ...classSets);
  element.states.add("disabled");
  return element;
};

test("B3 disabled customer text fields get an inert cue from existing tokens", () => {
  for (const element of [
    disabledText(["form-grid"], ["checkout-grid"]),
    disabledText(["form-grid"], ["profile-surface"]),
    disabledText(["form-field"], ["address-form"]),
  ]) {
    assert.equal(resolve("background", element).value, "var(--color-surface-sunken)");
    assert.equal(resolve("border-color", element).value, "var(--border-hairline-ui)");
    assert.equal(resolve("color", element).value, "var(--text-muted)");
    assert.equal(resolve("cursor", element).value, "not-allowed");
  }
  const disabledSelect = field("select", {}, ["form-field"], ["address-form"]);
  disabledSelect.states.add("disabled");
  assert.equal(resolve("background", disabledSelect).value, "var(--color-surface-sunken)");
});

test("B3 disabled styling does not leak to admin, search, checkboxes or read-only fields", () => {
  const admin = disabledText(["admin-screen"]);
  const search = field("input", { type: "search" }, ["search-field"]);
  search.states.add("disabled");
  for (const element of [admin, search]) {
    assert.notEqual(resolve("background", element)?.value, "var(--color-surface-sunken)");
    assert.notEqual(resolve("cursor", element)?.value, "not-allowed");
  }
  const checkbox = field("input", { type: "checkbox" }, ["checkbox-field"], ["address-form"]);
  checkbox.states.add("disabled");
  assert.equal(resolve("min-height", checkbox).value, "auto", "the address checkbox keeps its own box");
  assert.equal(resolve("background", checkbox), null);
  const readonly = field("input", { type: "text", readonly: "" }, ["form-grid"], ["profile-surface"]);
  assert.equal(resolve("background", readonly).value, "#eeeee4", "read-only keeps its own fill");
  assert.equal(resolve("color", readonly), null, "read-only is not painted as disabled");
  assert.equal(resolve("cursor", readonly), null);
});

test("B3 the saved-address default checkbox label meets the 44px interaction floor", () => {
  const addressLabel = field("label", {}, ["checkbox-field"], ["address-form"]);
  assert.equal(resolve("min-height", addressLabel).value, "44px");
  assert.equal(resolve("min-height", addressLabel).selector, ".address-form .checkbox-field label");
  assert.equal(
    resolve("min-height", field("label", {}, ["checkbox-field"])),
    null,
    "other checkbox labels are untouched",
  );
});

// ---------------------------------------------------------------------------
// Slice D — the Slice A tokens are consumed, and consuming them moved nothing.
// Every assertion here pairs the token with the literal it replaced, so a later
// retune of the token is visible as a failing test rather than a silent recolour.
// ---------------------------------------------------------------------------
const statusPanel = (...classes) => ({
  tag: "div",
  classes,
  id: undefined,
  attrs: {},
  states: new Set(),
  ancestors: chain(["main"]),
});

test("D1 the shared status panel resolves through the Slice A surface tokens", () => {
  assert.equal(
    resolve("background", statusPanel("ui-status", "ui-status-loading")).value,
    "var(--color-surface-status)",
    "loading and empty panels share one named surface",
  );
  assertToken("--color-surface-status", "#f0f1e9");
  const error = statusPanel("ui-status", "ui-status-error");
  assert.equal(resolve("background", error).value, "var(--danger-surface)", "the error variant wins the fill by source order");
  assertToken("--danger-surface", "#fbf1ec");
  assert.equal(resolve("border-left", error).value, "4px solid var(--danger-edge)");
  assert.equal(resolve("border", error).value, "1px solid var(--ui-border)", "the hairline still comes from the existing ui token");
  assert.equal(resolve("border-radius", error).value, "var(--ui-radius)", "and the radius from the existing surface token");
});

test("D1 control radii resolve through --radius-control and --radius-card", () => {
  assert.equal(resolve("border-radius", control("input", [], [])).value, "var(--radius-control)", "bare controls");
  assertToken("--radius-control", "0.35rem");
  const notice = { tag: "div", classes: ["checkout-notice"], id: undefined, attrs: {}, states: new Set(), ancestors: chain(["main"]) };
  assert.equal(resolve("border-radius", notice).value, "var(--radius-card)", "notices and history rows share the card radius");
  const historyRow = { tag: "li", classes: [], id: undefined, attrs: {}, states: new Set(), ancestors: chain(["order-history"]) };
  assert.equal(resolve("border-radius", historyRow).value, "var(--radius-card)", "the child selector still resolves");
  assertToken("--radius-card", "0.5rem");
  const looseLi = { tag: "li", classes: [], id: undefined, attrs: {}, states: new Set(), ancestors: chain(["main"]) };
  assert.notEqual(resolve("border-radius", looseLi)?.value, "var(--radius-card)", "only a row inside .order-history takes it");
});

test("D1 muted helper copy on the saved-address surfaces shares one token", () => {
  for (const classes of [["address-count"], ["no-addresses"], ["small-note"]]) {
    const el = { tag: "p", classes, id: undefined, attrs: {}, states: new Set(), ancestors: chain(["address-manager"]) };
    assert.equal(resolve("color", el).value, "var(--text-muted-warm)", `${classes[0]} muted ink`);
  }
  assertToken("--text-muted-warm", "#68685e");
});

test("D2 the deferred invalid-ink harmonization is still deferred, not quietly applied", () => {
  // The addresses panel keeps its legacy red. Harmonizing it onto --danger-* changes
  // an established appearance and is recorded for owner acceptance, not implemented.
  const panel = { tag: "div", classes: ["address-error"], id: undefined, attrs: {}, states: new Set(), ancestors: chain(["address-manager"]) };
  assert.equal(rootRule("--danger-legacy"), "#c33", "the legacy value is named, so the deferral is auditable");
  assert.equal(resolve("color", panel).value, "#c33");
  assert.equal(resolve("background", panel).value, "#fee");
  assert.equal(resolve("border-color", panel).value, "#fcc");
  assert.notEqual(resolve("color", panel).value, "var(--danger-text)", "do not claim palette adoption here");
});

// ---------------------------------------------------------------------------
// PDP-03A — the PDP-only 48px controls consume the approved large-control token.
// The Cart deliberately keeps the shared 44px floor, so both sides are resolved.
// ---------------------------------------------------------------------------
const pdpQuantityAncestors = () => chain(["quantity-control"], ["product-details"]);
const cartQuantityAncestors = () => chain(["quantity-control"], ["cart-line"]);

test("PDP-03A PDP quantity and Buy Now controls resolve to the 48px large-control token", () => {
  const stepper = { tag: "button", classes: [], id: undefined, attrs: {}, states: new Set(), ancestors: pdpQuantityAncestors() };
  for (const property of ["width", "height", "min-height"]) {
    assert.equal(resolve(property, stepper).value, "var(--control-height-large, 48px)", `PDP stepper ${property}`);
  }
  assert.equal(resolve("width", stepper).selector, ".product-details .quantity-control button");

  const input = { ...stepper, tag: "input", attrs: { type: "number" } };
  assert.equal(resolve("min-height", input).value, "var(--control-height-large, 48px)");
  assert.equal(resolve("width", input).value, "56px", "two digits stay clear of the stepper edges");

  const buy = {
    tag: "button", classes: ["button", "product-details-buy"], id: undefined, attrs: {}, states: new Set(),
    ancestors: chain(["product-details-actions"], ["product-details"]),
  };
  assert.equal(resolve("min-height", buy).value, "var(--control-height-large, 48px)");
  assert.equal(resolve("min-height", buy).selector, ".product-details-actions .product-details-buy");
  assertToken("--control-height-large", "48px");
});

test("PDP-03A the Cart quantity control keeps its 44px floor and 42px input", () => {
  const stepper = { tag: "button", classes: [], id: undefined, attrs: {}, states: new Set(), ancestors: cartQuantityAncestors() };
  assert.equal(resolve("width", stepper).value, "44px");
  assert.equal(resolve("min-height", stepper).value, "44px");
  assert.notEqual(resolve("min-height", stepper).selector, ".product-details .quantity-control button");

  const input = { ...stepper, tag: "input", attrs: { type: "number" } };
  assert.equal(resolve("min-height", input).value, "44px");
  assert.equal(resolve("width", input).value, "42px");
});

test("PDP-03A the PDP stepper group keeps the shared focus ring", () => {
  const group = {
    tag: "div", classes: ["quantity-control"], id: undefined, attrs: {}, states: new Set(["focus-within"]),
    ancestors: chain(["product-details"]),
  };
  // No PDP-specific focus rule was added: the shared 3px ring must still win.
  assert.equal(resolve("outline", group).selector, ".quantity-control:focus-within");
  assert.equal(resolve("outline", group).value, "3px solid #9a542e");
  assert.equal(resolve("outline-offset", group).value, "4px");
});

