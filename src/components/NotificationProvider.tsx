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
import { useAuth } from "../features/auth/AuthContext";
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

/** A notification together with the route and the session that created it. */
type ActiveNotification = { message: BagNoticeMessage; path: string; owner: string | null; generation: number };

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // A notification can carry customer-specific information, so it belongs to the
  // authenticated session that created it. The owner is taken from the trusted
  // auth context above this provider, never from the caller.
  const { session, sessionGeneration } = useAuth();
  const owner = session?.user.id ?? null;
  const [active, setActive] = useState<ActiveNotification | null>(null);
  const activeRef = useRef<ActiveNotification | null>(null);
  const nextId = useRef(0);
  const previousPath = useRef(pathname);
  const previousOwner = useRef(owner);
  // The route the customer is on and the authentication lifetime it belongs to.
  // Both are written during the commit, before any route can announce itself, so
  // a notifier captured on an earlier route or in an earlier sign-in lifetime can
  // be recognised as stale at the moment it is called.
  const currentPath = useRef(pathname);
  const currentGeneration = useRef(sessionGeneration);
  useInsertionEffect(() => {
    currentPath.current = pathname;
    currentGeneration.current = sessionGeneration;
  }, [pathname, sessionGeneration]);

  const dismiss = useCallback((id?: NotificationId) => {
    const current = activeRef.current;
    if (!current || (id !== undefined && current.message.id !== id)) return;
    // The toast normally restores focus itself. This also covers a programmatic
    // dismissal that removes the focused close control.
    focusPageIfNoticeHasFocus();
    activeRef.current = null;
    setActive(null);
  }, []);

  // Removes the active notification and returns a focus that the removal
  // dropped to the persistent page content.
  const clearActive = useCallback(() => {
    activeRef.current = null;
    setActive(null);
    const focused = document.activeElement;
    if (!focused || focused === document.body || focused === document.documentElement) {
      document.getElementById("main")?.focus();
    }
  }, []);

  const notify = useCallback((input: NotifyInput) => {
    // A notifier that was captured on a route the customer has left is stale.
    // Creating a notification from it would show an old route's message and
    // would bring that message back the next time the same pathname becomes
    // current again.
    if (currentPath.current !== pathname) return 0;
    // A notifier retained from an earlier sign-in lifetime is stale as well, even
    // when the customer id is unchanged. It must not replace the current
    // customer's notification, and it must not publish into a later lifetime.
    if (currentGeneration.current !== sessionGeneration) return 0;
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
      owner,
      generation: sessionGeneration,
    };
    activeRef.current = next;
    setActive(next);
    return next.message.id;
  }, [pathname, owner, sessionGeneration]);

  // A notification belongs to the route and to the session that created it.
  // The render guard keeps the previous route's toast out of the new route's
  // first committed render, and keeps another customer's toast out of the
  // first committed render of a new session.
  const visible = active && active.path === pathname && active.owner === owner && active.generation === sessionGeneration ? active.message : null;

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const current = activeRef.current;
    // Only the notification that belonged to the departed route is removed. A
    // notification the destination route created for itself stays, because it
    // belongs to the route the customer is on now.
    if (!current || current.path === pathname) return;
    clearActive();
  }, [pathname, clearActive]);

  // A notification of another session is removed when the session changes, so
  // it can neither be read in the new session nor come back if that customer
  // returns later.
  useEffect(() => {
    if (previousOwner.current === owner && (!activeRef.current || activeRef.current.generation === sessionGeneration)) return;
    previousOwner.current = owner;
    const current = activeRef.current;
    if (!current || (current.owner === owner && current.generation === sessionGeneration)) return;
    clearActive();
  }, [owner, sessionGeneration, clearActive]);

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
