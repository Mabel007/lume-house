import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldReveal } from "./useEditorialReveal.ts";

const VIEW = 900;
const box = (top: number, height: number) => ({
  top,
  height,
  bottom: top + height,
});

// The heights of the things the homepage actually reveals: the closing note, the
// collection links, The Lumé Edit and the full catalogue grid.
const HEIGHTS = [80, 180, 296, 744, 1200, 3317];

test("nothing reveals in the bottom strip of the viewport, where the old line fired", () => {
  // The old trigger was innerHeight * 0.92 = 828, which started a 720ms fade with
  // 72px of section on screen. None of these may fire there any more.
  for (const height of HEIGHTS) {
    for (const top of [675, 700, 780, 828]) {
      assert.equal(
        shouldReveal(box(top, height), VIEW),
        false,
        `height ${height} top ${top} filled ${(VIEW - top) / VIEW} of the viewport`,
      );
    }
  }
});

test("everything reveals once half the viewport is filled with it", () => {
  for (const height of HEIGHTS) {
    for (const top of [0, 200, 400, 450]) {
      assert.equal(shouldReveal(box(top, height), VIEW), true, `height ${height} top ${top}`);
    }
  }
});

test("a short section waits until it is well clear of the bottom edge", () => {
  // 180px tall: the lead line puts its top at 72% of the viewport, so the note is
  // entirely on screen before it starts to fade.
  assert.equal(shouldReveal(box(648, 180), VIEW), true);
  assert.equal(shouldReveal(box(650, 180), VIEW), false);
});

test("a section half its own height on screen reveals, however tall it is", () => {
  // The Lumé Edit is 744px: half of it (372px) is on screen at top 528.
  assert.equal(shouldReveal(box(528, 744), VIEW), true);
  assert.equal(shouldReveal(box(560, 744), VIEW), false);
});

test("a grid taller than the screen is judged by the viewport, not by itself", () => {
  // 3317px of catalogue: half of it is never visible at once, so it reveals when
  // 45% of the viewport (405px) is filled with it.
  assert.equal(shouldReveal(box(495, 3317), VIEW), true);
  assert.equal(shouldReveal(box(520, 3317), VIEW), false);
});

test("revealing never takes back a section that has already crossed the line", () => {
  for (const height of HEIGHTS) {
    let revealed = false;
    for (let top = VIEW; top >= -height; top -= 10) {
      const now = shouldReveal(box(top, height), VIEW);
      if (now) revealed = true;
      else assert.equal(revealed, false, `height ${height} stopped revealing at top ${top}`);
    }
  }
});

test("an unmeasurable viewport reveals rather than hides", () => {
  assert.equal(shouldReveal(box(5000, 744), 0), true);
  assert.equal(shouldReveal(box(5000, 744), -1), true);
  assert.equal(shouldReveal(box(5000, 0), VIEW), true);
});
