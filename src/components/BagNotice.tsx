import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export type BagNoticeTone = "success" | "failure" | "warning" | "info";
export type BagNoticeMessage = { id: number; tone: BagNoticeTone; text: string; durationMs?: number };

/** Default matches the `bag-notice-countdown` fallback in styles.css. */
const BAG_NOTICE_MS = 5000;
/** Mirrors the 20px viewport edge offset of .bag-notice-region in styles.css. */
const EDGE_OFFSET = 20;

type Box = { top: number; bottom: number; left: number; right: number };

function covers(band: Box, target: Box): boolean {
  return band.left < target.right && band.right > target.left && band.top < target.bottom && band.bottom > target.top;
}

function statusIcon(tone: BagNoticeTone) {
  if (tone === "success") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <path d="M8.4 12.3l2.5 2.5 4.7-5.3" />
      </svg>
    );
  }
  if (tone === "warning") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M12 3.8 21 20H3L12 3.8Z" />
        <path d="M12 9v4.6" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  if (tone === "info") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10.4v5.5" />
        <path d="M12 7.3h.01" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.4v5.6" />
      <path d="M12 16.3h.01" />
    </svg>
  );
}

export function BagNotice({ message, onExpire }: { message: BagNoticeMessage | null; onExpire: () => void }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const [atBottom, setAtBottom] = useState(false);
  const duration = message?.durationMs ?? BAG_NOTICE_MS;

  // Clearing the message can remove the control the visitor is using (the
  // dismiss button), which would drop focus onto <body>. Remember that state
  // before the message goes away so the layout effect can place focus back on
  // the page content instead of leaving it nowhere.
  const expire = () => {
    restoreFocus.current = regionRef.current?.contains(document.activeElement) ?? false;
    onExpire();
  };

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(expire, duration);
    return () => clearTimeout(timer);
    // `expire` is recreated per render but only reads refs; the timer is keyed to the message and duration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, onExpire, duration]);

  useLayoutEffect(() => {
    if (!message) {
      if (!restoreFocus.current) return;
      restoreFocus.current = false;
      const active = document.activeElement;
      const lostFocus = !active || active === document.body || active === document.documentElement || !active.isConnected;
      if (lostFocus) document.getElementById("main")?.focus();
      return;
    }
    const place = () => {
      const anchor = regionRef.current;
      if (!anchor) return;
      // The card lives in whichever live region currently carries the message
      // (polite for success, assertive for failure), so resolve it explicitly.
      const regions = Array.from(anchor.querySelectorAll<HTMLElement>(".bag-notice-region"));
      const region = regions.find(candidate => candidate.querySelector(".bag-notice"));
      const notice = region?.querySelector(".bag-notice");
      if (!region || !notice) return;
      const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
      const topOffset = Math.max(EDGE_OFFSET, Math.round(headerBottom + 12));
      region.style.setProperty("--bag-notice-top", `${topOffset}px`);
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || focused === document.body || focused === document.documentElement) {
        setAtBottom(false);
        return;
      }
      // Never relocate the notice out from under a control inside it (the
      // dismiss button); self-collision would move the toast the visitor is using.
      if (notice.contains(focused)) return;
      const toast = notice.getBoundingClientRect();
      const target = focused.getBoundingClientRect();
      if (!toast.height || !target.height) {
        setAtBottom(false);
        return;
      }
      const topBand = { top: topOffset, bottom: topOffset + toast.height, left: toast.left, right: toast.right };
      const bottomBand = {
        top: window.innerHeight - EDGE_OFFSET - toast.height,
        bottom: window.innerHeight - EDGE_OFFSET,
        left: toast.left,
        right: toast.right,
      };
      // The notice sits beneath the header by default and moves to the bottom
      // only when the top band would cover the control the visitor is using.
      setAtBottom(covers(topBand, target) && !covers(bottomBand, target));
    };
    place();
    // The toast is created by the interaction that also moved focus, so the
    // first pass can run before focus settles. Re-check on the next frame so the
    // collision fallback still sees the control the visitor is actually using.
    const schedule = window.requestAnimationFrame?.bind(window) ?? ((callback: () => void) => window.setTimeout(callback, 0));
    const cancel = window.cancelAnimationFrame?.bind(window) ?? window.clearTimeout.bind(window);
    const frame = schedule(place);
    window.addEventListener("focusin", place);
    window.addEventListener("focusout", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancel(frame);
      window.removeEventListener("focusin", place);
      window.removeEventListener("focusout", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [message]);

  const assertive = message?.tone === "failure";
  const cardStyle = { "--bag-notice-duration": `${duration}ms` } as CSSProperties;

  const card = message ? (
    <div key={message.id} className={`bag-notice ${message.tone}`} style={cardStyle}>
      <span className="bag-notice-icon">{statusIcon(message.tone)}</span>
      <p className="bag-notice-message">{message.text}</p>
      <button type="button" className="bag-notice-dismiss" aria-label="Dismiss notification" onClick={expire}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      </button>
      <span className="bag-notice-progress" aria-hidden="true">
        <span className="bag-notice-progress-bar" />
      </span>
    </div>
  ) : null;

  // Two mutually exclusive live regions keep announcements honest: the polite
  // region is always present (the reliable pattern for success copy) and stays
  // empty for failures, while the assertive region only exists while a failure
  // is showing. Exactly one region ever carries the message, so a screen reader
  // never hears the same notification twice.
  return (
    <div ref={regionRef} className="bag-notice-anchor">
      <div
        className={`bag-notice-region${atBottom && message ? " is-bottom" : ""}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {!assertive && card}
      </div>
      {assertive && (
        <div className={`bag-notice-region is-assertive${atBottom ? " is-bottom" : ""}`} aria-live="assertive" aria-atomic="true">
          {card}
        </div>
      )}
    </div>
  );
}
