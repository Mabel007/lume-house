import {
  useCallback,
  useEffect,
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

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<BagNoticeMessage | null>(null);
  const notificationRef = useRef<BagNoticeMessage | null>(null);
  const nextId = useRef(0);
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);

  const dismiss = useCallback((id?: NotificationId) => {
    const current = notificationRef.current;
    if (!current || (id !== undefined && current.id !== id)) return;
    // The toast normally restores focus itself. This also covers a programmatic
    // dismissal that removes the focused close control.
    focusPageIfNoticeHasFocus();
    notificationRef.current = null;
    setNotification(null);
  }, []);

  const notify = useCallback((input: NotifyInput) => {
    const message = input.message.trim();
    if (!message) return 0;

    const requested = input.durationMs;
    const durationMs =
      typeof requested === "number" && Number.isFinite(requested) && requested > 0
        ? requested
        : DEFAULT_NOTIFICATION_DURATIONS[input.tone];

    // A replacement removes the card the customer may be using. Move focus to
    // the persistent page before the old dismiss control disappears.
    if (notificationRef.current) focusPageIfNoticeHasFocus();

    const next: BagNoticeMessage = {
      id: ++nextId.current,
      tone: visualTone(input.tone),
      text: message,
      durationMs,
    };
    notificationRef.current = next;
    setNotification(next);
    return next.id;
  }, []);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (!notificationRef.current) return;
    focusPageIfNoticeHasFocus();
    notificationRef.current = null;
    setNotification(null);
  }, [pathname]);

  const onExpire = useCallback(() => dismiss(), [dismiss]);
  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <BagNotice message={notification} onExpire={onExpire} />
    </NotificationsContext.Provider>
  );
}
