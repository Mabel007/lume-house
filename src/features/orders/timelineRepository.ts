import type { SupabaseClient } from '@supabase/supabase-js';

export type TimelineEvent = {
  occurred_at: string;
  from_status: string | null;
  to_status: string;
  event_type: string;
};

/**
 * Load customer-visible timeline events for an order.
 * Caller must be the order owner (verified server-side via auth.uid()).
 * Returns sanitized transitions excluding internal admin notes.
 */
export async function loadOrderTimeline(
  client: SupabaseClient,
  orderId: string
): Promise<TimelineEvent[]> {
  const { data, error } = await client.rpc('get_customer_order_timeline', {
    p_order_id: orderId,
  });

  if (error) {
    if (error.message === 'order_not_found') {
      throw new Error('Order not found.');
    }
    if (error.message === 'auth_required') {
      throw new Error('Authentication required.');
    }
    throw new Error('Could not load order timeline.');
  }

  return (data as TimelineEvent[]) || [];
}

/**
 * Map timeline event_type to customer-friendly label.
 * Uses existing orderLabel() pattern for consistency.
 */
export function timelineEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    order_placed: 'Order placed',
    order_confirmed: 'Order confirmed',
    order_processing: 'Order processing',
    ready_for_pickup: 'Ready for pickup',
    out_for_delivery: 'Out for delivery',
    order_completed: 'Order completed',
    order_cancelled: 'Order cancelled',
    status_changed: 'Status updated',
  };
  return labels[eventType] || 'Status updated';
}

/**
 * Check if a timeline event represents a terminal state.
 * Terminal states: completed, cancelled
 */
export function isTerminalEvent(eventType: string): boolean {
  return eventType === 'order_completed' || eventType === 'order_cancelled';
}
