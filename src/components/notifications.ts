import { createContext, useContext } from "react";

export type NotificationTone = "success" | "error" | "warning" | "info";
export type NotificationId = number;

export type NotifyInput = {
  tone: NotificationTone;
  message: string;
  durationMs?: number;
};

export type NotificationsValue = {
  notify: (input: NotifyInput) => NotificationId;
  dismiss: (id?: NotificationId) => void;
};

/** Ordinary confirmations stay brief; warning/error copy gets more reading time. */
export const DEFAULT_NOTIFICATION_DURATIONS: Record<NotificationTone, number> = {
  success: 5000,
  info: 5000,
  warning: 8000,
  error: 8000,
};

export const NotificationsContext = createContext<NotificationsValue | null>(null);

export function useNotifications(): NotificationsValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("Notifications must be used inside NotificationProvider");
  return value;
}
