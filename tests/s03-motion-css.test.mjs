// The S03-01 corrections are only safe because of *where* their CSS lives: a hiding
// state outside a reduced-motion guard makes content invisible, parallax travel past
// the crop slack uncovers the frame it is clipped by, and a scroll-behavior that is
// not forced back to auto leaves panel stepping gliding for a reader who asked for
// it not to. jsdom cannot decide any of that, so the stylesheets are parsed here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SHEETS = ["motion", "styles", "story", "refinement", "typography"];
const text = Object.fromEntries(
  SHEETS.map((name) => [
    name,
    readFileSync(`src/${name}.css`, "utf8").replace(/\/\*[^]*?\*\//g, ""),
  ]),
);

const closeOf = (css, open) => {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}" && (depth -= 1) === 0) return i;
  }
  throw new Error("unbalanced stylesheet");
};

// Leaf rules, each with the at-rules wrapped around it.
function parse(css, ancestry, out, from = 0, to = css.length) {
  let cursor = from;
  while (cursor < to) {
    const open = css.indexOf("{", cursor);
    if (open === -1 || open >= to) break;
    const close = closeOf(css, open);
    if (close > to) break;
    // A semicolon before the brace ends a statement without a block (@import).
    const prelude = css.slice(Math.max(cursor, css.lastIndexOf(";", open) + 1), open).trim();
    const body = css.slice(open + 1, close);
    if (/^@(media|supports|keyframes)/.test(prelude))
      parse(css, [...ancestry, prelude], out, open + 1, close);
    else if (prelude) out.push({ prelude, body, ancestry });
    cursor = close + 1;
  }
  return out;
}

const cache = new Map();
const rules = (sheet) => {
  if (!cache.has(sheet)) cache.set(sheet, parse(text[sheet], [], []));
  return cache.get(sheet);
};
const where = (sheet, pick) => rules(sheet).filter(pick);
const optedIn = (rule) =>
  rule.ancestry.some((p) => p.startsWith("@media") && p.includes("no-preference"));
const reduced = (rule) =>
  rule.ancestry.some((p) => p.startsWith("@media") && p.includes("reduce"));
const selectors = (prelude) => prelude.split(",").map((part) => part.trim());

test("content is hidden only by motion the reader asked for", () => {
  const arming = where("motion", (rule) => /data-lume/.test(rule.prelude));
  assert.ok(arming.length >= 5, "the section and card states are styled");
  for (const rule of arming) {
    assert.ok(
      optedIn(rule),
      `${rule.prelude} must sit under prefers-reduced-motion: no-preference`,
    );
    if (/opacity:\s*0/.test(rule.body))
      assert.match(
        rule.prelude,
        /=\s*"pending"/,
        `${rule.prelude} hides content in a state the reveal engine never settles`,
      );
  }

  // The authored default is the finished composition: no rule anywhere keys off
  // "idle", and no sheet other than motion.css mentions the attributes at all.
  for (const sheet of SHEETS)
    assert.ok(
      sheet === "motion" || !/data-lume/.test(text[sheet]),
      `${sheet}.css arms a motion state it cannot undo`,
    );
  assert.ok(!/= "idle"/.test(text.motion), '"idle" stays unstyled, so it stays visible');

  // The reduced-motion kill switch removes the motion, never the content.
  const kill = where("styles", (rule) => reduced(rule) && /!important/.test(rule.body));
  assert.ok(kill.length > 0, "styles.css has no reduced-motion kill switch");
  const killed = kill.map((rule) => rule.body).join(";");
  for (const property of ["animation", "transition"])
    assert.match(
      killed,
      new RegExp(`${property}:\\s*none\\s*!important`),
      `reduced motion leaves ${property} running`,
    );
});

test("card entrances stay a restrained beat, not a queue", () => {
  const enter = where("motion", (rule) => /data-lume-enter/.test(rule.prelude));
  const delays = enter.flatMap((rule) =>
    [...rule.body.matchAll(/transition-delay:\s*(\d+)ms/g)].map(([, ms]) => Number(ms)),
  );
  assert.ok(delays.length >= 3, "a grid row is meant to arrive in a stagger");
  for (const ms of delays)
    assert.ok(ms <= 150, `a ${ms}ms delay reads as waiting, not as rhythm`);

  assert.equal(
    enter.filter((rule) => rule.prelude === '.product-card[data-lume-enter="shown"]').length,
    1,
    "the settled state restores the card exactly once",
  );
  for (const rule of enter.filter((r) => /=\s*"pending"/.test(r.prelude)))
    assert.ok(
      !/transition|animation/.test(rule.body),
      "a card that has not arrived yet must not already be animating",
    );
});

test("parallax travel stays inside the crop the overscale provides", () => {
  const frames = where("motion", (rule) =>
    rule.ancestry.some((p) => p.startsWith("@keyframes lume-parallax-soft")),
  );
  assert.equal(frames.length, 2, "one from and one to");
  const offsets = frames.map((rule) => {
    const match = rule.body.match(/translate3d\(0,\s*(-?\d+)%,\s*0\)\s*scale\(([\d.]+)\)/);
    assert.ok(match, `${rule.prelude} does not move and overscale in one transform`);
    return { offset: Number(match[1]), scale: Number(match[2]) };
  });
  assert.equal(offsets[0].scale, offsets[1].scale, "only depth moves, the scale holds");
  assert.ok(offsets[0].offset < 0 && offsets[1].offset > 0, "the image drifts through its centre");

  // Scaling a box by s leaves (s-1)/2 of it outside each edge of the frame.
  const slack = ((offsets[0].scale - 1) / 2) * 100;
  for (const { offset } of offsets)
    assert.ok(
      Math.abs(offset) <= slack,
      `${Math.abs(offset)}% of travel exceeds the ${slack}% crop slack and uncovers the frame`,
    );

  const usage = where(
    "motion",
    (rule) =>
      rule.prelude === ".edit-pieces .product-image img" && /animation-timeline/.test(rule.body),
  );
  assert.equal(usage.length, 1);
  assert.match(usage[0].body, new RegExp(`transform: scale\\(${offsets[0].scale}\\)`));
  assert.ok(
    usage[0].ancestry.some((p) => p.startsWith("@supports") && p.includes("animation-timeline")),
    "scroll-driven depth must be gated on browser support",
  );
  assert.ok(optedIn(usage[0]));
  const [start, end] = usage[0].body
    .match(/animation-range:\s*cover\s+(\d+)%\s+cover\s+(\d+)%/)
    .slice(1)
    .map(Number);
  assert.ok(
    start >= 0 && end <= 100 && end - start >= 40,
    `cover ${start}-${end}% spends too little of the journey on screen`,
  );

  // view() tracks the nearest scrollable ancestor, so the frame must not be one.
  const frame = where("motion", (rule) => rule.prelude === ".edit-pieces .product-image");
  assert.equal(frame.length, 1);
  assert.match(frame[0].body, /overflow:\s*clip/, "hidden would make the frame a scroll container");
});

test("the catalogue grid carries no mount animation left behind", () => {
  const cards = where("styles", (rule) =>
    selectors(rule.prelude).some((selector) => selector.split(/[\s>+~]/)[0].startsWith(".product-card")),
  );
  assert.ok(cards.length >= 3, "the card itself is styled in styles.css");
  for (const rule of cards)
    assert.ok(
      !/animation:/.test(rule.body),
      `${rule.prelude} animates at mount, where nobody can see it`,
    );
  // Removing the card animation must not have orphaned the shared keyframes.
  assert.match(text.styles, /@keyframes quiet-enter/);
  assert.ok(
    where("styles", (rule) => /quiet-enter/.test(rule.body)).length > 0,
    "quiet-enter lost every consumer",
  );
});

test("in-page and panel scrolling glide only for readers who allow motion", () => {
  for (const sheet of SHEETS)
    for (const rule of where(sheet, (r) => /scroll-behavior:\s*smooth/.test(r.body)))
      assert.ok(
        optedIn(rule),
        `${sheet}.css ${rule.prelude} smooth-scrolls without an opt-in, so it would animate route changes too`,
      );
  assert.equal(
    where("story", (r) => selectors(r.prelude).includes(".story-track") && /smooth/.test(r.body)).length,
    1,
    "the story track is the one smooth scroll container",
  );
  for (const sheet of ["styles", "refinement"])
    assert.ok(
      where(sheet, (rule) => reduced(rule) && /scroll-behavior:\s*auto\s*!important/.test(rule.body))
        .length > 0,
      `${sheet}.css reduces without forcing scrolling back to instant`,
    );

  // The keyboard handler leaves the behaviour to the stylesheet, so the kill switch
  // above is what decides glide or jump.
  const handler = readFileSync("src/features/story/StoryPrototypePage.tsx", "utf8");
  assert.match(handler, /scrollIntoView\(\{\s*block:\s*"nearest",\s*inline:\s*"center"\s*\}\)/);
  assert.ok(
    !/scrollIntoView\(\{[^}]*behavior/.test(handler),
    "a hardcoded behavior would override the reduced-motion stylesheet",
  );

  // Anchor smoothness is per click, never global, so the skip link and every other
  // route keep native behaviour and Layout's route-change reset stays instant.
  const shop = readFileSync("src/features/products/ShopPage.tsx", "utf8");
  assert.ok(
    (shop.match(/href="#collection"[^>]*onClick=\{followInPageAnchor\}/g) ?? []).length >= 2,
    "the hero anchor and the collection link both glide",
  );
  assert.match(shop, /id="collection"\s+tabIndex=\{-1\}/);
  assert.ok(!/scroll-behavior/.test(readFileSync("index.html", "utf8")));
});

test("the field looks usable, focuses once, and never hides its own control", () => {
  const base = where("styles", (rule) => rule.prelude === ".search-field");
  assert.equal(base.length, 1, "the search field has one structural rule");
  // Full width is the layout contract: the field shares the section's content box,
  // so nothing may narrow it or push its neighbours. Its inset is padding on a
  // border-box element, which is why the global border-box matters here.
  assert.match(text.styles, /^\s*\*\s*\{\s*box-sizing:\s*border-box\s*;?\s*\}/m);
  for (const property of ["width", "height", "margin", "top", "left", "right", "bottom"])
    assert.ok(
      !new RegExp(`(^|;)\\s*${property}\\s*:`).test(base[0].body),
      `the search field sets ${property}, which can move the layout`,
    );
  assert.match(base[0].body, /position:\s*relative/);
  // Discoverable at rest: a fill that is not the page cream and a complete edge,
  // not a rule under a line of type.
  assert.match(base[0].body, /background:\s*#/);
  assert.match(base[0].body, /border:\s*1px solid/);
  assert.match(base[0].body, /border-radius:/);
  assert.match(base[0].body, /cursor:\s*text/);
  const page = text.styles.match(/:root\s*\{[^}]*background:\s*(#[0-9a-f]{3,6})/);
  const fill = base[0].body.match(/background:\s*(#[0-9a-f]{3,6})/);
  assert.ok(
    page && fill && page[1].toLowerCase() !== fill[1].toLowerCase(),
    "a field painted the colour of the page is not a field",
  );

  // Intentional focus treatments: the field's own edge/surface plus a subtle
  // underline sweep on the field (transform-based, no layout shift), respecting reduced motion.
  const afterRulesAll = where("styles", (rule) => rule.prelude === ".search-field::after");
  const afterBaseRules = afterRulesAll.filter((r) => !r.ancestry.some((a) => a.includes("prefers-reduced-motion")));
  assert.equal(afterBaseRules.length, 1, "one base underline-sweep pseudo-element on the field");
  for (const r of afterBaseRules) {
    assert.match(r.body, /position:\s*absolute/);
    assert.match(r.body, /transform:\s*scaleX\(0\)/);
    assert.ok(!/(^|;)\s*(width|margin|padding|border-width)\s*:/.test(r.body), "underline sweep must not affect layout geometry");
  }
  const afterFocusRules = where("styles", (rule) => rule.prelude === ".search-field:focus-within::after");
  // focus-within::after may be set inside media queries; ensure any such rule sets transform to scaleX(1)
  for (const r of afterFocusRules) {
    assert.match(r.body, /transform:\s*scaleX\(1\)/);
  }
  const active = where("styles", (rule) => rule.prelude === ".search-field:focus-within");
  assert.equal(active.length, 1, "one resting-to-active rule");
  assert.match(active[0].body, /border-color:/);
  assert.match(active[0].body, /background:/);
  assert.ok(
    base[0].body.includes("transition") && /border-color/.test(base[0].body.match(/transition:[^;]*/)[0]),
    "the edge would snap instead of easing, so idle and active read as two components",
  );

  // The keyboard ring is additive, hugs the component, and survives forced colors.
  const rings = where("styles", (rule) => /search-field:has\(input:focus-visible\)/.test(rule.prelude));
  assert.equal(rings.length, 1, "one keyboard focus ring for the whole component");
  assert.match(rings[0].body, /outline:\s*2px solid/, "an outline, not a shadow, keeps forced colors");
  assert.match(rings[0].body, /outline-offset:\s*0/);
  assert.ok(
    rings[0].ancestry.some((p) => p.startsWith("@supports") && p.includes(":has")),
    "the ring is only swapped in where :has() can target the field",
  );
  for (const rule of [...rings, ...where("styles", (r) => /search-field:focus-within/.test(r.prelude))])
    assert.ok(
      !/(^|;)\s*(width|height|margin|padding|border-width|font-size)\s*:/.test(rule.body),
      `${rule.prelude} changes geometry on focus, which would shift the layout`,
    );
  // Suppressing the input's own outline must stay inside the same guard, or a
  // browser without :has() would be left with no focus indicator at all.
  const suppression = where(
    "styles",
    (rule) => rule.prelude === ".search-field input:focus-visible" && /outline:\s*none/.test(rule.body),
  );
  assert.equal(suppression.length, 1);
  assert.ok(
    suppression[0].ancestry.some((p) => p.startsWith("@supports") && p.includes(":has")),
    "focus visibility may only be traded for the component ring where that ring will paint",
  );

  // The magnifier and the phrases share one origin, derived from the field's inset.
  const hosts = where("styles", (rule) => rule.prelude === ".product-search");
  const token = hosts.filter((rule) => /--search-inset/.test(rule.body));
  assert.equal(token.length, 1, "the inset is declared once, on the field's own wrapper");
  assert.match(token[0].body, /--search-inset:\s*[\d.]+rem/);
  for (const rule of hosts.filter((host) => host !== token[0]))
    assert.ok(
      rule.ancestry.some((p) => /^@media/.test(p) && p.includes("max-width")) &&
        /^margin-top:/.test(rule.body.trim()),
      `${rule.prelude} restyles the wrapper outside the responsive block`,
    );
  const prompts = where("styles", (rule) => rule.prelude === ".search-prompts");
  assert.equal(prompts.length, 1);
  assert.match(
    prompts[0].body,
    /left:\s*calc\(var\(--search-inset\)\s*\+\s*20px\s*\+\s*0\.75rem\)/,
    "a phrase must start on the field's own text inset plus the glyph and its gap",
  );

  // The wrapper invites a click anywhere in its own box, so no padding is left
  // dead under a text cursor.
  const shop = readFileSync("src/features/products/ShopPage.tsx", "utf8");
  assert.match(
    shop,
    /className="search-field" onClick=\{\(\) => searchInput\.current\?\.focus\(\)\}/,
    "the field's edge and magnifier are part of the control, so they belong to the input",
  );

  const glyphUses = where("motion", (rule) =>
    /\.search-glyph-(ring|handle)/.test(rule.prelude) && /animation:/.test(rule.body),
  );
  assert.ok(glyphUses.length >= 2, "both magnifier strokes animate on focus");
  for (const rule of glyphUses) {
    assert.ok(optedIn(rule), `${rule.prelude} draws the glyph without an opt-in`);
    assert.match(rule.prelude, /:focus-within/, "the glyph only draws on focus");
  }

  for (const sheet of SHEETS)
    for (const rule of where(sheet, (r) => /search-glyph|search-field/.test(r.prelude)))
      assert.ok(
        !/(^|;)\s*(opacity|visibility)\s*:\s*(0|hidden)\b/.test(rule.body),
        `${sheet}.css ${rule.prelude} hides the search control`,
      );
});

// An interrupted stylesheet leaves two kinds of damage: a keyframe nobody plays,
// and a decoration that runs where it should not. Both are invisible to a render
// assertion, so the sheets themselves are asked.
test("no keyframe is authored without something to play it", () => {
  const declared = SHEETS.flatMap((sheet) =>
    [...text[sheet].matchAll(/@keyframes\s+([a-z][a-z0-9-]*)/g)].map(([, name]) => name),
  );
  assert.ok(declared.length >= 10, "the authored motion vocabulary is the subject here");
  const played = new Set(
    SHEETS.flatMap((sheet) =>
      rules(sheet).flatMap((rule) =>
        [...rule.body.matchAll(/animation(?:-name)?:\s*([^;]+)/g)].flatMap(([, value]) =>
          value.split(",").map((name) => name.trim().split(/\s+/)[0]),
        ),
      ),
    ),
  );
  for (const name of declared)
    assert.ok(played.has(name), `${name} is declared but never played`);
});

test("the idle search prompts cycle in CSS, stand down for typing and never speak", () => {
  // Authored off, opted in on: a reduced-motion reader, or a browser that drops
  // the block, keeps one stable field with its placeholder intact.
  const base = where("styles", (rule) =>
    selectors(rule.prelude).includes(".search-prompts"),
  );
  assert.equal(base.length, 1, "one resting prompt layer");
  assert.match(base[0].body, /display:\s*none/);

  const layer = where("motion", (rule) => /search-prompts/.test(rule.prelude));
  assert.ok(layer.length >= 3, "the layer fades, cycles and stands down");
  for (const rule of layer)
    assert.ok(optedIn(rule), `${rule.prelude} moves the prompts without an opt-in`);
  assert.ok(
    layer.some((rule) => /animation-play-state:\s*paused/.test(rule.body)),
    "an unseen loop would keep compositing while the reader types",
  );
  assert.ok(
    where("motion", (rule) => /::placeholder/.test(rule.prelude)).length >= 1,
    "the placeholder and the prompts would both claim the empty field",
  );

  // One phrase owns a fifth of the loop, so five phrases hand over without overlap.
  const [, loop] = text.motion.match(/--motion-prompt-loop:\s*(\d+)s/);
  const [, step] = text.motion.match(/--motion-prompt-step:\s*(\d+)s/);
  assert.equal(Number(loop), Number(step) * 5, "the loop is one step per phrase");

  // The phrases are decoration over a real control: aria-hidden, derived from the
  // query the reader owns, and driven by CSS rather than a timer.
  const shop = readFileSync("src/features/products/ShopPage.tsx", "utf8");
  assert.match(shop, /className="search-prompts" aria-hidden="true"/);
  assert.match(shop, /data-search-idle=\{query\.length === 0 \? "true" : undefined\}/);
  assert.ok(!/setInterval|setTimeout/.test(shop), "a timer would rerender the catalogue");
});

test("a long phrase clips inside the field instead of running past its edge", () => {
  // text-overflow only paints on a block container. The phrases used to be flex
  // items of a line box, so a narrow field simply pushed the glyphs out of the
  // layer with nothing to say they had been cut. The whole truncation contract is
  // these four properties on one rule, and the layer has to bound their width.
  const spans = where("styles", (rule) =>
    selectors(rule.prelude).includes(".search-prompts span"),
  );
  assert.equal(spans.length, 1, "one layout contract for the phrases");
  const [span] = spans;
  assert.ok(
    !reduced(span),
    "the phrases would overflow for a reader whose motion guard skipped the rule",
  );
  for (const [property, pattern] of [
    ["display", /display:\s*block/],
    ["white-space", /white-space:\s*nowrap/],
    ["overflow", /overflow:\s*clip/],
    ["text-overflow", /text-overflow:\s*ellipsis/],
  ])
    assert.match(span.body, pattern, `${property} is what makes an over-long phrase readable as truncated`);
  assert.ok(
    !/display:\s*(flex|inline-flex|grid)/.test(span.body),
    "a flex phrase box never paints an ellipsis",
  );
  assert.match(
    span.body,
    /position:\s*absolute/,
    "the phrases share one box rather than sitting side by side in a row",
  );

  // Absolutely positioned with a left and a right anchor, so the box has a width
  // to overflow. An `inset` with only one edge would size to the words and clip
  // nothing.
  const layer = where("styles", (rule) => rule.prelude === ".search-prompts")[0];
  assert.match(layer.body, /position:\s*absolute/);
  assert.match(layer.body, /left:/);
  assert.match(layer.body, /right:/);
  assert.match(layer.body, /overflow:\s*clip/);

  // And nothing further down the cascade puts the phrases back under flex control.
  for (const sheet of SHEETS)
    for (const rule of where(sheet, (candidate) =>
      /search-prompts(\s+span)?/.test(candidate.prelude),
    )) {
      if (rule === layer || rule === span) continue;
      assert.ok(
        !/display:\s*(flex|inline-flex|grid)/.test(rule.body),
        `${sheet}.css ${rule.prelude} re-flexes the phrase box and drops the ellipsis`,
      );
    }

  // Graceful truncation is not a licence to truncate. The layer is 214px wide in
  // the narrowest field the site supports, which carries about 26 glyphs of
  // Georgia italic at 1.05rem, so a longer phrase reaches the reader elided before
  // it is read.
  const shop = readFileSync("src/features/products/ShopPage.tsx", "utf8");
  const [, authored] = shop.match(/const searchPrompts = \[([\s\S]*?)\];/);
  const phrases = [...authored.matchAll(/"([^"]+)"/g)].map(([, words]) => words);
  assert.equal(phrases.length, 5, "one phrase per fifth of the loop");
  for (const phrase of phrases)
    assert.ok(
      phrase.length <= 26,
      `"${phrase}" is ${phrase.length} glyphs: it cannot be read whole at 320px`,
    );
});

test("the curtain reaches the catalogue and the cards answer without shifting", () => {
  const veil = where(
    "motion",
    (rule) => /product-image::after/.test(rule.prelude) && /animation:/.test(rule.body),
  );
  assert.equal(veil.length, 1, "one curtain per card, armed once");
  assert.ok(optedIn(veil[0]));
  assert.match(
    veil[0].prelude,
    /data-lume-enter="shown"/,
    "the veil retracts with the card the reader is actually seeing",
  );
  assert.equal(
    where("styles", (rule) => /product-image::after/.test(rule.prelude) && /animation:/.test(rule.body))
      .length,
    0,
    "the resting veil in styles.css must never move on its own",
  );

  const tactile = where("motion", (rule) =>
    /\.product-card:(hover|active)\b/.test(rule.prelude) ||
    /\.product-card:has\(/.test(rule.prelude),
  );
  assert.ok(tactile.length >= 4, "hover, keyboard focus and press are all authored");
  for (const rule of tactile) {
    assert.ok(optedIn(rule), `${rule.prelude} moves a card that asked for no motion`);
    assert.ok(
      !/(^|;)\s*(width|height|margin|padding|top|left|right|bottom|font-size)\s*:/.test(rule.body),
      `${rule.prelude} changes layout on interaction, which would shift the grid`,
    );
  }
  for (const rule of tactile.filter((r) => /:hover/.test(r.prelude)))
    assert.ok(
      rule.ancestry.some((p) => p.includes("(hover: hover)")),
      `${rule.prelude} would leave a tapped card lifted on touch`,
    );
  // Pressing an add button focuses it, so a focus-within lift is a lift that never
  // comes back down; only a focus the reader tabbed to may hold a card up.
  assert.ok(
    !tactile.some((rule) => /:focus-within/.test(rule.prelude)),
    "a focus-within card transform sticks after a click or a tap",
  );
  // And the tabbed-to card gets all of the pointer's response, not just the lift.
  for (const part of [".product-image", ".product-index", ".product-category"])
    assert.ok(
      tactile.some((rule) => rule.prelude.includes(`:has(:focus-visible) ${part}`)),
      `the keyboard never gets the ${part} response`,
    );
});

test("filter chips: mobile 48px min-height preserved and desktop overrides corrected", () => {
  // styles.css sets 48px for filter buttons under (max-width: 700px)
  const stylesMobileFilter = where("styles", (rule) => {
    if (rule.prelude !== ".filters button") return false;
    const has700 = rule.ancestry.some((a) => /max-width:\s*700px/.test(a));
    return has700;
  });
  assert.ok(stylesMobileFilter.length >= 1, "styles.css must set .filters button in a 700px media query");
  const sets48 = stylesMobileFilter.some((r) => /min-height:\s*48px/.test(r.body));
  assert.ok(sets48, "styles.css mobile media query must set min-height: 48px on .filters button");

  // refinement.css must NOT set min-height: 44px unconditionally on .filters button
  const refUnconditional = where("refinement", (rule) => rule.prelude === ".filters button" && rule.ancestry.length === 0);
  for (const r of refUnconditional) {
    assert.ok(!/min-height:\s*44px/.test(r.body), "refinement.css must not set 44px min-height unconditionally on .filters button");
  }
  const refDesktop = where("refinement", (rule) => {
    if (rule.prelude !== ".filters button") return false;
    return rule.ancestry.some((a) => /min-width:\s*701px/.test(a));
  });
  assert.ok(refDesktop.some((r) => /min-height:\s*44px/.test(r.body)), "refinement.css should set 44px min-height on .filters button at >=701px");

  // typography.css must not set min-height for .filters button
  const typoRules = where("typography", (rule) => rule.prelude && rule.prelude.includes(".filters button") && /min-height/.test(rule.body));
  assert.equal(typoRules.length, 0, "typography.css must not set min-height for .filters button");
});

test("each homepage composition is handed to the engine exactly once", () => {
  const shop = readFileSync("src/features/products/ShopPage.tsx", "utf8");
  assert.match(shop, /useEditorialReveal\(state\.status === "ready"\)/);
  assert.match(shop, /useProductCardEntrance\(cardEntranceRevision\)/);
  for (const hook of ["lume-edit wrap", "collection-links wrap", "closing-note wrap"])
    assert.match(
      shop,
      new RegExp(`className="${hook}"\\s+data-lume-reveal="idle"`),
      `${hook} never joins the reveal, so its motion state is unreachable`,
    );
  // The cards settle one by one; fading the grid they live in as well would spend
  // the same beat twice and hide priced cards behind a container that outlives them.
  assert.match(shop, /className="product-grid">/);
  assert.ok(!/product-grid[^>]*data-lume-reveal/.test(shop), "the catalogue grid is revealed twice");
  // Masked lines are laid out as blocks with or without motion, so the composed
  // heading is the same text either way.
  for (const mask of ["edit-line", "edit-line-inner", "closing-line", "closing-line-inner"])
    assert.ok(shop.includes(`"${mask}"`), `the ${mask} mask is missing`);
});
