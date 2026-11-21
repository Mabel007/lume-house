import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentPanelIndex } from "./storyWalk.ts";

// A row as it really is: 368px panels on a 396px pitch inside a 1280px track whose
// left edge sits at 100px, scrolled by `scrollLeft`.
function row(scrollLeft: number, options: { panels?: number; width?: number; gap?: number; view?: number } = {}) {
  const { panels = 6, width = 368, gap = 28, view = 1280 } = options;
  const left = 100;
  return {
    view: { left, width: view },
    panelCount: panels,
    panels: Array.from({ length: panels }, (_, index) => ({
      left: left + index * (width + gap) - scrollLeft,
      width,
    })),
  };
}

test("the piece in the middle of the row is the one the reader is on", () => {
  const at = row(0);
  assert.equal(currentPanelIndex(at.panels, at.view), 1);
  assert.equal(currentPanelIndex(row(792).panels, row(792).view), 3);
});

test("arrow keys walk the row one piece at a time to its end", () => {
  const at = row(0);
  const visited: number[] = [];
  let index = currentPanelIndex(at.panels, at.view);
  while (index + 1 < at.panelCount) {
    index += 1;
    visited.push(index);
  }
  // The old step was 80% of the row's width — larger than the row's whole
  // scrollable length — so the first press landed on the last panel and every
  // press after it looked dead.
  assert.deepEqual(visited, [2, 3, 4, 5]);
  assert.equal(at.panels[index + 1], undefined, "one press past the last piece goes nowhere");
  assert.equal(currentPanelIndex(row(1980).panels, row(1980).view), 5, "clamped at the end of the row");
});

test("a panel wider than the row is still stepped, not swallowed", () => {
  const at = row(0, { panels: 4, width: 900, gap: 28, view: 400 });
  assert.equal(currentPanelIndex(at.panels, at.view), 0);
  assert.equal(currentPanelIndex(row(928, { panels: 4, width: 900, gap: 28, view: 400 }).panels, at.view), 1);
});

test("a single piece row has nothing to step through", () => {
  const at = row(0, { panels: 1 });
  assert.equal(currentPanelIndex(at.panels, at.view), 0);
  assert.equal(at.panels[0 + 1], undefined);
});

// The walk is a candidate being reviewed on this branch, not a storefront route.
// It stays mounted where the review happens and nowhere else: the entry file gates
// it on Vite's development flag, which the production build replaces with `false`
// before it writes the bundle, so what ships has no /prototype/story and the
// catch-all 404 answers that address instead.
test("the prototype is mounted for development and left out of production", () => {
  const entry = readFileSync("src/main.tsx", "utf8");
  const marker = `path="/prototype/story"`;
  assert.equal(
    entry.split(marker).length - 1,
    1,
    "the sideways walk is mounted from exactly one place",
  );
  assert.match(
    entry.split(marker)[0].slice(-160),
    /import\.meta\.env\.DEV &&\s*\(\s*<Route\s*$/,
    "that one place is inside a development guard",
  );
  assert.match(entry, /path="\*"/, "an unknown address still lands on the 404");

  // Nothing in the shipped chrome may point at it either: a link would advertise a
  // route that a reader on the deployed site cannot reach.
  const layout = readFileSync("src/components/Layout.tsx", "utf8");
  assert.ok(!layout.includes("/prototype"), "the prototype stays out of the navigation");
});
