import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loadOrderTimeline, timelineEventLabel, isTerminalEvent, type TimelineEvent } from './timelineRepository';
import './orderPresentation.css';

type TimelineState = 
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; events: TimelineEvent[] };

/**
 * Format timestamp in customer's local timezone.
 * Uses browser's toLocaleString() which automatically converts from UTC.
 */
function formatCustomerTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Customer-facing order timeline component.
 * Displays sanitized status transitions with local timezone timestamps.
 * Excludes internal admin notes and operational details.
 */
export function CustomerOrderTimeline({ orderId }: { orderId: string }) {
  const [state, setState] = useState<TimelineState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    
    loadOrderTimeline(getSupabaseClient(), orderId)
      .then(events => {
        if (active) {
          setState({ status: 'ready', events });
        }
      })
      .catch(error => {
        if (active) {
          setState({ 
            status: 'error', 
            message: error instanceof Error ? error.message : 'Timeline could not be loaded.' 
          });
        }
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  if (state.status === 'loading') {
    return (
      <section aria-labelledby="timeline-heading" aria-busy="true">
        <h3 id="timeline-heading">Order timeline</h3>
        <p className="timeline-loading">Loading order timeline…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-labelledby="timeline-heading">
        <h3 id="timeline-heading">Order timeline</h3>
        <p className="timeline-error" role="alert">{state.message}</p>
      </section>
    );
  }

  if (state.events.length === 0) {
    return (
      <section aria-labelledby="timeline-heading">
        <h3 id="timeline-heading">Order timeline</h3>
        <p className="timeline-empty">No timeline events recorded yet.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="timeline-heading">
      <h3 id="timeline-heading">Order timeline</h3>
      <p className="timeline-description">
        Track your order progress from placement to completion.
      </p>
      <ol className="order-activity" aria-label="Order status timeline">
        {state.events.map((event, index) => {
          const isTerminal = isTerminalEvent(event.event_type);
          const isCurrent = index === state.events.length - 1;
          
          return (
            <li 
              key={`${event.occurred_at}-${event.event_type}`}
              aria-current={isCurrent ? 'step' : undefined}
              className={isTerminal ? 'terminal-event' : undefined}
            >
              <strong className="event-label">
                {timelineEventLabel(event.event_type)}
              </strong>
              <time 
                dateTime={event.occurred_at}
                className="event-time"
                title={formatCustomerTime(event.occurred_at)}
              >
                {formatCustomerTime(event.occurred_at)}
              </time>
              {isCurrent && !isTerminal && (
                <span className="event-current" aria-label="Current status">
                  Current
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
