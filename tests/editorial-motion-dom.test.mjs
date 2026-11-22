// Motion corrections for S03-01, driven against a fake layout: jsdom has no layout
// engine, so element boxes, the viewport and the scroll offset are supplied here and
// the reveal and anchor code runs for real.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";

const VIEW = 900;
const PAGE = 9000;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "http://localhost:5173/",
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

for (const name of ["window", "document", "Element", "HTMLElement", "Node", "Event"])
  Object.defineProperty(globalThis, name, { configurable: true, value: window[name] });
for (const name of ["requestAnimationFrame", "cancelAnimationFrame"])
  Object.defineProperty(globalThis, name, { configurable: true, value: window[name].bind(window) });
Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEW });
Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: PAGE });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A page far taller than the viewport: nothing is at the end of it unless a test
// moves the scroll offset there.
const boxes = new WeakMap();
const box = (top, height) => ({ top, height, bottom: top + height });
const measure = (element) => boxes.get(element) ?? { top: 0, height: 0, bottom: 0 };
window.Element.prototype.getBoundingClientRect = function () {
  const { top, height, bottom } = measure(this);
  return { top, left: 0, right: 1000, bottom, width: 1000, height, x: 0, y: top, toJSON: () => ({}) };
};
window.HTMLElement.prototype.scrollIntoView = function (options) {
  window.__scrolledTo.push({ id: this.id, options });
};
window.__scrolledTo = [];

let observers = [];
class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    this.disconnected = false;
    observers.push(this);
  }
  observe(element) {
    this.targets.add(element);
  }
  unobserve(element) {
    this.targets.delete(element);
  }
  disconnect() {
    this.targets.clear();
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
}
const useObserver = (value) =>
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value,
  });
useObserver(FakeIntersectionObserver);
const liveObservers = () => observers.filter((observer) => !observer.disconnected);

let useEditorialReveal;
let useProductCardEntrance;
let followInPageAnchor;
let anchorFragment;
let server;
let root;

before(async () => {
  const { createServer } = await import("./helpers/vite.mjs");
  server = await createServer({
    configFile: false,
    envDir: false,
    server: { middlewareMode: true, hmr: false },
  });
  ({ useEditorialReveal, useProductCardEntrance } = await server.ssrLoadModule(
    "/src/components/useEditorialReveal.ts",
  ));
  ({ followInPageAnchor, anchorFragment } = await server.ssrLoadModule(
    "/src/components/inPageAnchor.ts",
  ));
});

after(async () => {
  await server.close();
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  document.getElementById("root").replaceChildren();
  for (const id of ["hero-link", "collection"]) document.getElementById(id)?.remove();
  observers = [];
  window.__scrolledTo = [];
  window.scrollY = 0;
  window.history.replaceState(null, "", "/");
  useObserver(FakeIntersectionObserver);
});

function Sections({ items }) {
  useEditorialReveal(true);
  return React.createElement(
    "div",
    null,
    items.map((item) =>
      React.createElement("section", {
        key: item.key,
        "data-lume-reveal": "idle",
        ref: (element) => {
          if (element) boxes.set(element, box(item.top, item.height));
        },
      }),
    ),
  );
}

function Cards({ items }) {
  useProductCardEntrance(items.map((item) => item.key).join("|"));
  return React.createElement(
    "div",
    { className: "product-grid" },
    items.map((item) =>
      React.createElement("article", {
        key: item.key,
        className: "product-card",
        "data-lume-enter": "idle",
        ref: (element) => {
          if (element) boxes.set(element, box(item.top, item.height));
        },
      }),
    ),
  );
}

async function render(element) {
  const { createRoot } = await import("react-dom/client");
  await act(async () => {
    if (!root) root = createRoot(document.getElementById("root"));
    root.render(element);
  });
}

// The scroll listener is rAF-throttled, so a scroll event only takes effect on the
// next frame, exactly as it does in a browser.
async function frame() {
  await act(async () => {
    await new Promise((resolve) =>
      window.requestAnimationFrame(() => setTimeout(resolve, 0)),
    );
  });
}

async function scroll() {
  await act(async () => {
    window.dispatchEvent(new window.Event("scroll"));
  });
  await frame();
}

// Frames the test hands out itself, so that a sweep being queued or cancelled is a
// count rather than a race against jsdom's clock.
function drivingFrames() {
  const saved = {
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const pending = new Map();
  let next = 1;
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback) => {
      const id = next;
      next += 1;
      pending.set(id, callback);
      return id;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (id) => {
      pending.delete(id);
    },
  });
  return {
    pending,
    restore() {
      for (const [name, value] of Object.entries(saved))
        Object.defineProperty(globalThis, name, { configurable: true, value });
    },
  };
}

const state = (element, attribute) => element.getAttribute(attribute);
const everyState = (selector, attribute) =>
  all(selector).map((element) => state(element, attribute));
const all = (selector) => Array.from(document.querySelectorAll(selector));

test("a section fades when half of it is on screen, not when it touches the bottom edge", async () => {
  await render(
    React.createElement(Sections, {
      items: [
        { key: "read", top: 100, height: 744 },
        { key: "edit", top: 2000, height: 744 },
      ],
    }),
  );
  const [read, edit] = all("[data-lume-reveal]");
  assert.deepEqual(everyState("[data-lume-reveal]", "data-lume-reveal"), ["shown", "pending"]);
  assert.equal(read.getAttribute("data-lume-reveal"), "shown", "already in view keeps its finished composition");
  assert.equal(liveObservers().length, 1, "one observer serves the page");

  // 260px of a 744px section on screen (29% of the viewport). The old trigger line
  // sat at 0.92 * innerHeight = 828 and would have started the fade here, against
  // the bottom edge, mostly off screen.
  boxes.set(edit, box(640, 744));
  await scroll();
  assert.equal(state(edit, "data-lume-reveal"), "pending", "the strip above the bottom edge is not an audience");

  // Half of it on screen: now the fade has one.
  boxes.set(edit, box(528, 744));
  await scroll();
  assert.equal(state(edit, "data-lume-reveal"), "shown");
});

test("a section brought into view without a scroll event still reveals", async () => {
  await render(
    React.createElement(Sections, { items: [{ key: "edit", top: 2000, height: 744 }] }),
  );
  const [edit] = all("[data-lume-reveal]");
  assert.equal(state(edit, "data-lume-reveal"), "pending");
  // Media loading above it grows the page and moves the section up: no scroll
  // event ever fires, so the observer's own pass is the only signal.
  boxes.set(edit, box(528, 744));
  await act(async () => {
    liveObservers()[0].callback([{ target: edit, isIntersecting: true }], liveObservers()[0]);
  });
  await frame();
  assert.equal(state(edit, "data-lume-reveal"), "shown");
});

test("a viewport that changes shape is judged again without a scroll", async () => {
  await render(
    React.createElement(Sections, { items: [{ key: "edit", top: 800, height: 744 }] }),
  );
  const [edit] = all("[data-lume-reveal]");
  assert.equal(
    state(edit, "data-lume-reveal"),
    "pending",
    "800px down a 900px viewport is below the lead line",
  );

  // The reader rotates to landscape. The section crossed no observer threshold on
  // the way, so a viewport that can only be re-measured by a scroll would leave it
  // faded out in the middle of a wider screen.
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 1200 });
  try {
    await act(async () => {
      window.dispatchEvent(new window.Event("resize"));
    });
    await frame();
    assert.equal(state(edit, "data-lume-reveal"), "shown", "the resize alone re-measured it");
  } finally {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEW });
  }
});

test("a smaller viewport keeps what has settled and waits for the rest", async () => {
  await render(
    React.createElement(Sections, {
      items: [
        { key: "read", top: 100, height: 744 },
        { key: "edit", top: 800, height: 744 },
      ],
    }),
  );
  const [read, edit] = all("[data-lume-reveal]");
  assert.deepEqual(
    [state(read, "data-lume-reveal"), state(edit, "data-lume-reveal")],
    ["shown", "pending"],
  );

  Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });
  try {
    const turn = async () => {
      await act(async () => {
        window.dispatchEvent(new window.Event("orientationchange"));
      });
      await frame();
    };
    await turn();
    assert.equal(state(read, "data-lume-reveal"), "shown", "a finished composition is not wound back");
    assert.equal(state(edit, "data-lume-reveal"), "pending", "shrinking the viewport invents no audience");

    // And the event does measure: the same section now high in the smaller screen.
    boxes.set(edit, box(200, 744));
    await turn();
    assert.equal(state(edit, "data-lume-reveal"), "shown", "orientationchange counts as a re-measure");
  } finally {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEW });
  }
});

test("fast scrolling and anchor jumps never leave a section hidden", async () => {
  await render(
    React.createElement(Sections, {
      items: [{ key: "edit", top: 2000, height: 744 }],
    }),
  );
  const [edit] = all("[data-lume-reveal]");
  assert.equal(state(edit, "data-lume-reveal"), "pending");
  // Carried clean past the section between two samples.
  boxes.set(edit, box(-3000, 744));
  await scroll();
  assert.equal(state(edit, "data-lume-reveal"), "passed", "settled without a fade nobody is watching");

  // A reload into a restored scroll position: the first pass must never leave a
  // section waiting for a line the reader has already carried it past.
  await act(async () => {
    root.unmount();
    root = null;
  });
  await render(
    React.createElement(Sections, {
      items: [
        { key: "read", top: -200, height: 744 },
        { key: "links", top: 200, height: 296 },
        { key: "closing", top: 3000, height: 180 },
      ],
    }),
  );
  assert.deepEqual(
    everyState("[data-lume-reveal]", "data-lume-reveal"),
    ["passed", "shown", "pending"],
    "scrolled past settles without motion, in view settles finished, below waits",
  );
});

test("a grid taller than the screen is judged by the viewport, not by its own height", async () => {
  await render(
    React.createElement(Sections, { items: [{ key: "grid", top: 2000, height: 3317 }] }),
  );
  const [grid] = all("[data-lume-reveal]");
  boxes.set(grid, box(520, 3317));
  await scroll();
  assert.equal(state(grid, "data-lume-reveal"), "pending", "400px on screen is not yet 45% of the viewport");
  boxes.set(grid, box(495, 3317));
  await scroll();
  assert.equal(state(grid, "data-lume-reveal"), "shown");
});

test("content the reader can never scroll up to is still revealed", async () => {
  await render(
    React.createElement(Sections, { items: [{ key: "closing", top: 2000, height: 180 }] }),
  );
  const [closing] = all("[data-lume-reveal]");
  assert.equal(state(closing, "data-lume-reveal"), "pending");
  boxes.set(closing, box(760, 180));
  window.scrollY = PAGE - VIEW;
  await scroll();
  assert.equal(state(closing, "data-lume-reveal"), "shown", "no permanently invisible editorial content");
});

test("nothing is hidden when the enhancement cannot run", async () => {
  useObserver(undefined);
  await render(
    React.createElement(Sections, { items: [{ key: "edit", top: 2000, height: 744 }] }),
  );
  assert.deepEqual(everyState("[data-lume-reveal]", "data-lume-reveal"), ["idle"], "no observer, no arming");

  useObserver(FakeIntersectionObserver);
  const media = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query) => ({ matches: query.includes("reduce"), media: query }),
  });
  await render(
    React.createElement(Sections, { items: [{ key: "note", top: 2000, height: 180 }] }),
  );
  assert.deepEqual(everyState("[data-lume-reveal]", "data-lume-reveal"), ["idle"], "reduced motion, no arming");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: media });
});

test("cards enter as they are browsed, and a filtered grid keeps every card visible", async () => {
  await render(
    React.createElement(Cards, {
      items: [
        { key: "read", top: 100, height: 500 },
        { key: "below", top: 2600, height: 500 },
      ],
    }),
  );
  const [read, below] = all("[data-lume-enter]");
  assert.equal(state(read, "data-lume-enter"), "shown", "a card already on screen is simply visible");
  assert.equal(state(below, "data-lume-enter"), "pending", "not animated at mount, off screen");
  assert.equal(liveObservers().length, 1, "one observer for the grid, not one per card");

  boxes.set(below, box(400, 500));
  await scroll();
  assert.equal(state(below, "data-lume-enter"), "shown", "it enters as it is browsed into view");

  // A filter replaces the grid. The settled card keeps its state, a card the new
  // set shows on screen is visible at once, and only the cards genuinely below the
  // line are armed — still served by a single observer.
  await render(
    React.createElement(Cards, {
      items: [
        { key: "read", top: 100, height: 500 },
        { key: "below", top: 400, height: 500 },
        { key: "later", top: 3000, height: 500 },
        { key: "last", top: 3600, height: 500 },
      ],
    }),
  );
  assert.deepEqual(
    everyState("[data-lume-enter]", "data-lume-enter"),
    ["shown", "shown", "pending", "pending"],
  );
  assert.equal(liveObservers().length, 1);
  assert.equal(liveObservers()[0].targets.size, 2, "only the two waiting cards are observed");

  // Reduced motion leaves the cards exactly as authored: visible.
  await render(React.createElement(Cards, { items: [] }));
  const media = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query) => ({ matches: query.includes("reduce"), media: query }),
  });
  await render(
    React.createElement(Cards, { items: [{ key: "quiet", top: 3000, height: 500 }] }),
  );
  assert.deepEqual(everyState("[data-lume-enter]", "data-lume-enter"), ["idle"]);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: media });
});

test("leaving the page stops the enhancement", async () => {
  await render(
    React.createElement(Sections, { items: [{ key: "edit", top: 2000, height: 744 }] }),
  );
  assert.equal(liveObservers().length, 1);
  await act(async () => {
    root.unmount();
    root = null;
  });
  assert.equal(liveObservers().length, 0, "observer disconnected on unmount");
});

test("leaving the page cancels the sweep that is already queued", async () => {
  await render(
    React.createElement(Sections, { items: [{ key: "edit", top: 2000, height: 744 }] }),
  );
  const [edit] = all("[data-lume-reveal]");
  assert.equal(state(edit, "data-lume-reveal"), "pending");

  const frames = drivingFrames();
  try {
    // Scrolled into view and navigated away inside the same frame.
    boxes.set(edit, box(300, 744));
    await act(async () => {
      window.dispatchEvent(new window.Event("scroll"));
    });
    assert.equal(frames.pending.size, 1, "one sweep queued for the whole page");
    await act(async () => {
      window.dispatchEvent(new window.Event("resize"));
    });
    assert.equal(frames.pending.size, 1, "a second event reuses the frame already queued");

    await act(async () => {
      root.unmount();
      root = null;
    });
    assert.equal(frames.pending.size, 0, "unmount cancelled the queued sweep");
    assert.equal(state(edit, "data-lume-reveal"), "pending", "no work lands on a page the reader left");
  } finally {
    frames.restore();
  }
});

const click = (anchor, overrides = {}) => ({
  button: 0,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  defaultPrevented: false,
  currentTarget: anchor,
  preventDefault() {
    this.defaultPrevented = true;
  },
  ...overrides,
});

function anchorToCollection() {
  document.body.insertAdjacentHTML(
    "beforeend",
    '<a id="hero-link" href="#collection">Explore the collection</a><section id="collection" tabindex="-1"></section>',
  );
  return document.getElementById("hero-link");
}

test("a plain click on an in-page anchor becomes a scroll that keeps focus and history", async () => {
  const anchor = anchorToCollection();
  const section = document.getElementById("collection");
  const focuses = [];
  const focus = section.focus.bind(section);
  section.focus = (options) => {
    focuses.push(options);
    focus(options);
  };
  const pushes = [];
  const pushState = window.history.pushState.bind(window.history);
  window.history.pushState = (...args) => {
    pushes.push(args);
    pushState(...args);
  };

  const event = click(anchor);
  await act(async () => followInPageAnchor(event));
  assert.equal(event.defaultPrevented, true, "the instantaneous jump is replaced");
  assert.deepEqual(window.__scrolledTo, [
    { id: "collection", options: { behavior: "smooth", block: "start" } },
  ]);
  assert.ok(section.hasAttribute("tabindex"), "the section declares itself a focus destination");
  assert.deepEqual(focuses, [{ preventScroll: true }], "focus moves without interrupting the scroll");
  assert.deepEqual(pushes, [[null, "", "#collection"]]);
  assert.equal(window.location.hash, "#collection", "the address bar keeps the fragment");

  // A repeat click on the fragment already in the address bar navigates nowhere,
  // so native behaviour adds no history entry and neither does this.
  await act(async () => followInPageAnchor(click(anchor)));
  assert.equal(pushes.length, 1, "no duplicate history entry");

  window.history.pushState = pushState;
});

test("reduced motion scrolls an anchor instantly, and every other click is left alone", async () => {
  const anchor = anchorToCollection();
  const media = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query) => ({ matches: query.includes("reduce"), media: query }),
  });
  await act(async () => followInPageAnchor(click(anchor)));
  assert.deepEqual(window.__scrolledTo[0].options, { behavior: "auto", block: "start" });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: media });

  const untouched = async (overrides, label) => {
    const event = click(anchor, overrides);
    let prevented = 0;
    event.preventDefault = () => {
      prevented += 1;
    };
    await act(async () => followInPageAnchor(event));
    assert.equal(prevented, 0, `${label} is left to the browser`);
    assert.equal(window.__scrolledTo.length, 1);
  };
  for (const [overrides, label] of [
    [{ ctrlKey: true }, "new tab"],
    [{ metaKey: true }, "new tab"],
    [{ shiftKey: true }, "shift click"],
    [{ altKey: true }, "alternate click"],
    [{ button: 1 }, "middle click"],
    [{ defaultPrevented: true }, "a click another handler already took"],
  ])
    await untouched(overrides, label);

  const other = document.createElement("a");
  other.setAttribute("href", "https://lumehouse.invalid/about");
  assert.equal(anchorFragment(click(other)), null, "a link to another page is not hijacked");
  other.setAttribute("href", "#");
  assert.equal(anchorFragment(click(other)), null, "a bare fragment means the top of the page, not a target");
  other.setAttribute("href", "#nowhere-on-this-page");
  assert.equal(anchorFragment(click(other)), "nowhere-on-this-page");
  const missing = click(other);
  let ignored = 0;
  missing.preventDefault = () => {
    ignored += 1;
  };
  await act(async () => followInPageAnchor(missing));
  assert.equal(ignored, 0, "a fragment with no target in this document is left to the browser");
});
