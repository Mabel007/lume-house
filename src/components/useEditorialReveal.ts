import { useEffect } from "react";

type RevealAttribute = "data-lume-reveal" | "data-lume-enter";

export type ViewportBox = {
  top: number;
  bottom: number;
  height: number;
};

// How much of an element has to be on screen before its entrance may start.
// Either half of the element, or 45% of the viewport filled by it, or its top
// edge reaching 72% of the viewport height, whichever happens first. The
// viewport term is what a section taller than any screen is judged by (the
// catalogue grid is several viewports long, and half of it is never visible at
// once); the lead term is what stops a short section from starting its fade in
// the last strip of pixels above the bottom edge, where nobody is looking.
const ELEMENT_FRACTION = 0.5;
const VIEWPORT_FRACTION = 0.45;
const LEAD_FRACTION = 0.72;

// Sub-pixel difference between the two heights a scroll-end test compares.
const SCROLL_END_SLACK = 4;

// Everything that can move a section relative to the line it is judged against:
// the reader scrolling, and the viewport itself changing shape.
const VIEWPORT_EVENTS = ["scroll", "resize", "orientationchange"] as const;

// Nothing below the fold can be reached once the page has been scrolled to its
// end, so what is on screen stops waiting for a line it can no longer cross.
function atEndOfPage(): boolean {
  return (
    window.scrollY + window.innerHeight >=
    document.documentElement.scrollHeight - SCROLL_END_SLACK
  );
}

// True once `box` is far enough into the viewport of `innerHeight` that its
// entrance has an audience. A viewport that cannot be measured returns true:
// content that never animates must still be content that is always readable.
export function shouldReveal(box: ViewportBox, innerHeight: number): boolean {
  if (innerHeight <= 0 || box.height <= 0) return true;
  const required = Math.min(
    box.height * ELEMENT_FRACTION,
    innerHeight * VIEWPORT_FRACTION,
  );
  return box.top <= Math.min(innerHeight * LEAD_FRACTION, innerHeight - required);
}

// One arming pass over every [attribute] element that has not settled yet.
// Elements start and remain fully visible unless this can arm them, so a missing
// observer, a reduced-motion preference or a failed effect never hides editorial
// content or a product card.
function armReveals(attribute: RevealAttribute): () => void {
  const noop = () => {};
  if (typeof IntersectionObserver === "undefined") return noop;
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return noop;

  // Elements not yet revealed.
  const armed = new Set<HTMLElement>();
  let observer: IntersectionObserver | null = null;
  // The pending rAF, or 0 while nothing is queued: its identity is what says
  // whether a sweep is already on its way, and cancelling it is what stops a
  // measurement landing on a page the reader has already left.
  let frame = 0;

  const detach = () => {
    observer?.disconnect();
    observer = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    for (const type of VIEWPORT_EVENTS) window.removeEventListener(type, onViewportChange);
  };

  const settle = (element: HTMLElement, value: string) => {
    element.setAttribute(attribute, value);
    armed.delete(element);
    observer?.unobserve(element);
    // Past the last element the page is static, so the enhancement stops
    // costing anything instead of sitting on the scroll path all visit.
    if (armed.size === 0) detach();
  };

  // An anchor jump, an End key press or a restored scroll position can carry an
  // element past the viewport between two observer samples, and an element above
  // the view never reports an entry, so a first entry cannot be the only path to
  // a visible section. Anything already scrolled past is settled as "passed": it
  // is not being watched, so it gets the finished composition with no motion
  // attached rather than a fade that has no audience.
  const sweep = () => {
    frame = 0;
    const innerHeight = window.innerHeight;
    const pageEnd = atEndOfPage();
    for (const element of Array.from(armed)) {
      const box = element.getBoundingClientRect();
      if (box.bottom <= 0) settle(element, "passed");
      else if (pageEnd || shouldReveal(box, innerHeight))
        settle(element, "shown");
    }
  };

  // One throttle for every signal: a drag-resize fires many events per frame and
  // each one measures the same layout.
  function onViewportChange() {
    if (frame) return;
    frame = requestAnimationFrame(sweep);
  }

  const innerHeight = window.innerHeight;
  const pageEnd = atEndOfPage();
  for (const element of Array.from(
    document.querySelectorAll<HTMLElement>(`[${attribute}]`),
  )) {
    const settled = element.getAttribute(attribute);
    // "pending" is not settled: a previous pass armed it and its observer may
    // already be gone, so re-arming here is what keeps it from hiding forever.
    if (settled === "shown" || settled === "passed") continue;
    const box = element.getBoundingClientRect();
    if (box.bottom > 0 && !pageEnd && !shouldReveal(box, innerHeight)) {
      element.setAttribute(attribute, "pending");
      armed.add(element);
    } else {
      element.setAttribute(attribute, box.top < 0 ? "passed" : "shown");
    }
  }
  if (armed.size === 0) return noop;

  observer = new IntersectionObserver(onViewportChange, {
    threshold: [0, 0.25, 0.5, 0.75, 1],
  });
  for (const element of armed) observer.observe(element);
  // An observer only reports a section as it crosses one of those thresholds, so a
  // rotation that leaves it 40% on screen and below the lead line is silent, and the
  // section would wait there for a scroll the reader may never make.
  for (const type of VIEWPORT_EVENTS)
    window.addEventListener(type, onViewportChange, { passive: true });

  return detach;
}

// Reveals each [data-lume-reveal] section once, as enough of it enters the view.
export function useEditorialReveal(ready: boolean): void {
  useEffect(() => armReveals("data-lume-reveal"), [ready]);
}

// Reveals each [data-lume-enter] card as enough of it enters the view, so the
// catalogue animates while it is browsed instead of once at mount. `revision`
// changes with the rendered set, which is what arms the cards a filter, a page
// change or a fresh result adds; anything already settled keeps its state, and a
// card this cannot arm is simply visible.
export function useProductCardEntrance(revision: string): void {
  useEffect(() => armReveals("data-lume-enter"), [revision]);
}
