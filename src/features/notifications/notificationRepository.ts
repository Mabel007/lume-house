import type { SupabaseClient } from '@supabase/supabase-js';

export type CustomerNotification = {
  id: string;
  order_id: string;
  event_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

/**
 * Load customer notifications, newest first.
 * Caller must be authenticated (verified server-side via auth.uid()).
 */
export async function loadNotifications(
  client: SupabaseClient,
  options: { limit?: number; unreadOnly?: boolean } = {}
): Promise<CustomerNotification[]> {
  const { limit = 50, unreadOnly = false } = options;

  let query = client
    .from('customer_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error('Could not load notifications.');
  }

  return (data as CustomerNotification[]) || [];
}

/**
 * Get unread notification count for badge display.
 */
export async function getUnreadCount(client: SupabaseClient): Promise<number> {
  const { count, error } = await client
    .from('customer_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);

  if (error) {
    throw new Error('Could not load unread count.');
  }

  return count || 0;
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(
  client: SupabaseClient,
  notificationId: string
): Promise<void> {
  const { error } = await client.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });

  if (error) {
    if (error.message === 'notification_not_found') {
      throw new Error('Notification not found.');
    }
    throw new Error('Could not mark notification as read.');
  }
}

/**
 * Mark a single notification as unread.
 */
export async function markAsUnread(
  client: SupabaseClient,
  notificationId: string
): Promise<void> {
  const { error } = await client.rpc('mark_notification_unread', {
    p_notification_id: notificationId,
  });

  if (error) {
    if (error.message === 'notification_not_found') {
      throw new Error('Notification not found.');
    }
    throw new Error('Could not mark notification as unread.');
  }
}

/**
 * Mark all notifications as read.
 * Returns the number of notifications that were marked as read.
 */
export async function markAllAsRead(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('mark_all_notifications_read');

  if (error) {
    throw new Error('Could not mark all notifications as read.');
  }

  return (data as number) || 0;
}

/**
 * Map event_type to icon name for UI display.
 */
export function notificationIcon(eventType: string): string {
  const icons: Record<string, string> = {
    order_placed: '📦',
    order_confirmed: '✓',
    order_processing: '⚙️',
    ready_for_pickup: '🏪',
    out_for_delivery: '🚚',
    order_completed: '🎉',
    order_cancelled: '✕',
  };
  return icons[eventType] || '🔔';
}

/**
 * Check if notification represents a terminal state.
 */
export function isTerminalNotification(eventType: string): boolean {
  return eventType === 'order_completed' || eventType === 'order_cancelled';
}

/**
 * Format a timestamp as relative time (e.g., "5 minutes ago").
 */
export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return 'just now';
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;
  } else if (diffHour < 24) {
    return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
  } else if (diffDay < 30) {
    return diffDay === 1 ? '1 day ago' : `${diffDay} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
