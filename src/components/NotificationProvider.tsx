import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { BagNotice, type BagNoticeMessage } from "./BagNotice";
import {
  DEFAULT_NOTIFICATION_DURATIONS,
  NotificationsContext,
  type NotificationId,
  type NotificationTone,
  type NotifyInput,
} from "./notifications";

function visualTone(tone: NotificationTone): BagNoticeMessage["tone"] {
  return tone === "error" ? "failure" : tone;
}

function focusPageIfNoticeHasFocus() {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest(".bag-notice")) {
    document.getElementById("main")?.focus();
  }
}

/** A notification together with the route that created it. */
type ActiveNotification = { message: BagNoticeMessage; path: string };

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [active, setActive] = useState<ActiveNotification | null>(null);
  const activeRef = useRef<ActiveNotification | null>(null);
  const nextId = useRef(0);
  const previousPath = useRef(pathname);
  // The route the customer is on. It is written during the commit, before any
  // route can announce itself, so a notifier captured on an earlier route can
  // be recognised as stale at the moment it is called.
  const currentPath = useRef(pathname);
  useInsertionEffect(() => {
    currentPath.current = pathname;
  }, [pathname]);

  const dismiss = useCallback((id?: NotificationId) => {
    const current = activeRef.current;
    if (!current || (id !== undefined && current.message.id !== id)) return;
    // The toast normally restores focus itself. This also covers a programmatic
    // dismissal that removes the focused close control.
    focusPageIfNoticeHasFocus();
    activeRef.current = null;
    setActive(null);
  }, []);

  const notify = useCallback((input: NotifyInput) => {
    // A notifier that was captured on a route the customer has left is stale.
    // Creating a notification from it would show an old route's message and
    // would bring that message back the next time the same pathname becomes
    // current again.
    if (currentPath.current !== pathname) return 0;
    const message = input.message.trim();
    if (!message) return 0;

    const requested = input.durationMs;
    const durationMs =
      typeof requested === "number" && Number.isFinite(requested) && requested > 0
        ? requested
        : DEFAULT_NOTIFICATION_DURATIONS[input.tone];

    // A replacement removes the card the customer may be using. Move focus to
    // the persistent page before the old dismiss control disappears.
    if (activeRef.current) focusPageIfNoticeHasFocus();

    const next: ActiveNotification = {
      message: {
        id: ++nextId.current,
        tone: visualTone(input.tone),
        text: message,
        durationMs,
      },
      path: pathname,
    };
    activeRef.current = next;
    setActive(next);
    return next.message.id;
  }, [pathname]);

  // A notification belongs to the route that created it. The render guard keeps
  // the previous route's toast out of the new route's first committed render,
  // so a stale notification can never flash on the page the customer moved to.
  const visible = active && active.path === pathname ? active.message : null;

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const current = activeRef.current;
    // Only the notification that belonged to the departed route is removed. A
    // notification the destination route created for itself stays, because it
    // belongs to the route the customer is on now.
    if (!current || current.path === pathname) return;
    activeRef.current = null;
    setActive(null);
    // The route change removed the toast. If that removal dropped focus, return
    // it to the page content instead of leaving it on <body>.
    const focused = document.activeElement;
    if (!focused || focused === document.body || focused === document.documentElement) {
      document.getElementById("main")?.focus();
    }
  }, [pathname]);

  // The expiry carries the notification id, so a timer that was already queued
  // when a newer notification replaced this one can never dismiss it.
  const onExpire = useCallback((id: number) => dismiss(id), [dismiss]);
  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <BagNotice message={visible} onExpire={onExpire} />
    </NotificationsContext.Provider>
  );
}
