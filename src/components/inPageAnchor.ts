import type { MouseEvent } from "react";

// The fragment a click on this anchor should animate to, or null when the click
// belongs to the browser rather than to us: a non-primary or modified click (new
// tab, new window), or an href that is not a fragment of this document.
export type AnchorClick = {
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  currentTarget: { hash: string };
};

export function anchorFragment(event: AnchorClick): string | null {
  const { button, altKey, ctrlKey, metaKey, shiftKey, defaultPrevented } = event;
  if (defaultPrevented || button !== 0 || altKey || ctrlKey || metaKey || shiftKey)
    return null;
  const { hash } = event.currentTarget;
  if (!hash.startsWith("#") || hash.length < 2) return null;
  return hash.slice(1);
}

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// The editorial homepage used to throw the reader past every composition they had
// not scrolled into yet, because an unanimated fragment jump carries no motion at
// all. This keeps the parts of native anchor navigation that carry meaning — the
// target is focused when it declares itself a focus destination, and the fragment
// lands in the address bar and the history list — and replaces only the jump.
export function followInPageAnchor(
  event: MouseEvent<HTMLAnchorElement>,
): void {
  const fragment = anchorFragment(event);
  if (!fragment) return;
  const target = document.getElementById(fragment);
  if (!target) return;
  event.preventDefault();
  // Under reduced motion this resolves to instant, because styles.css forces
  // scroll-behavior: auto on every element when motion is reduced.
  target.scrollIntoView({
    behavior: reducedMotion() ? "auto" : "smooth",
    block: "start",
  });
  if (target.hasAttribute("tabindex")) target.focus({ preventScroll: true });
  // A repeat click on the fragment already in the address bar navigates nowhere,
  // so native behaviour adds no history entry and neither do we.
  if (window.location.hash !== `#${fragment}`)
    window.history.pushState(null, "", `#${fragment}`);
}
