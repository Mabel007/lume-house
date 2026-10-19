import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type BagNoticeMessage = { id: number; tone: "success" | "failure"; text: string };

const BAG_NOTICE_MS = 5000;
/** Mirrors the 20px viewport edge offset of .bag-notice-region in styles.css. */
const EDGE_OFFSET = 20;

type Box = { top: number; bottom: number; left: number; right: number };

function covers(band: Box, target: Box): boolean {
  return band.left < target.right && band.right > target.left && band.top < target.bottom && band.bottom > target.top;
}

export function BagNotice({ message, onExpire }: { message: BagNoticeMessage | null; onExpire: () => void }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(false);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onExpire, BAG_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [message, onExpire]);

  useLayoutEffect(() => {
    if (!message) return;
    const place = () => {
      const notice = regionRef.current?.querySelector(".bag-notice");
      const focused = document.activeElement;
      if (!notice || !(focused instanceof HTMLElement) || focused === document.body || focused === document.documentElement) {
        setAtTop(false);
        return;
      }
      const toast = notice.getBoundingClientRect();
      const target = focused.getBoundingClientRect();
      if (!toast.height || !target.height) {
        setAtTop(false);
        return;
      }
      const bottomBand = {
        top: window.innerHeight - EDGE_OFFSET - toast.height,
        bottom: window.innerHeight - EDGE_OFFSET,
        left: toast.left,
        right: toast.right,
      };
      const topBand = { top: EDGE_OFFSET, bottom: EDGE_OFFSET + toast.height, left: toast.left, right: toast.right };
      // Keep the familiar bottom placement unless only moving to the top clears the focused control.
      setAtTop(covers(bottomBand, target) && !covers(topBand, target));
    };
    place();
    window.addEventListener("focusin", place);
    window.addEventListener("focusout", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("focusin", place);
      window.removeEventListener("focusout", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [message]);

  return (
    <div ref={regionRef} className={`bag-notice-region${atTop && message ? " is-top" : ""}`} role="status" aria-live="polite">
      {message && (
        <p key={message.id} className={`bag-notice ${message.tone}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
