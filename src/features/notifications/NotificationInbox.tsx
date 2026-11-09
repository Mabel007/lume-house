import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../auth/AuthContext';
import {
  loadNotifications,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  notificationIcon,
  isTerminalNotification,
  type CustomerNotification
} from './notificationRepository';
import { PageHeader } from '../../components/PageHeader';
import './notifications.css';

/**
 * Format notification timestamp in customer's local timezone.
 */
function formatNotificationTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type InboxState = 
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; notifications: CustomerNotification[] };

/**
 * Customer notification inbox page.
 * Displays all notifications with read/unread toggle.
 * Supports mark all as read functionality.
 */
export function NotificationInbox() {
  const auth = useAuth();
  if (auth.loading || !auth.session) return <section className="wrap page-section"><PageHeader title="Notifications" breadcrumbLabel="Notifications" trail={[{label: 'Home', to: '/'}, {label: 'My Account', to: '/account'}]} /><p>{auth.loading ? 'Loading your account…' : 'Please sign in to view your notifications.'}</p></section>;
  return <CustomerInbox key={auth.session.user.id + ':' + (auth.sessionGeneration ?? 0)} />;
}

function CustomerInbox() {
  const [state, setState] = useState<InboxState>({status: 'loading'});
  const [busy, setBusy] = useState<string | null>(null);
  const [markAllBusy, setMarkAllBusy] = useState(false);
  const active = useRef(false);
  const request = useRef(0);
  const mutating = useRef(false);
  const loadNotificationsList = useCallback(() => {
    const ticket = ++request.current;
    if (!active.current) return Promise.resolve();
    return loadNotifications(getSupabaseClient(), {limit: 100}).then(
      notifications => {
        if (active.current && ticket === request.current) setState({status: 'ready', notifications});
      },
      error => {
        if (active.current && ticket === request.current) setState({status: 'error', message: error instanceof Error ? error.message : 'Notifications could not be loaded.'});
      },
    );
  }, []);

  useEffect(() => {
    active.current = true;
    void loadNotificationsList();
    return () => { active.current = false; };
  }, [loadNotificationsList]);
  async function handleToggleRead(notification: CustomerNotification) {
    if (mutating.current) return;
    mutating.current = true; setBusy(notification.id);
    try {
      if (notification.is_read) await markAsUnread(getSupabaseClient(), notification.id);
      else await markAsRead(getSupabaseClient(), notification.id);
      if (active.current) await loadNotificationsList();
    } catch {
      if (active.current) setState({status: 'error', message: 'Could not update this notification. Please try again.'});
    } finally {
      mutating.current = false;
      if (active.current) setBusy(null);
    }
  }
  async function handleMarkAllRead() {
    if (mutating.current) return;
    mutating.current = true; setMarkAllBusy(true);
    try {
      await markAllAsRead(getSupabaseClient());
      if (active.current) await loadNotificationsList();
    } catch {
      if (active.current) setState({status: 'error', message: 'Could not mark notifications as read. Please try again.'});
    } finally {
      mutating.current = false;
      if (active.current) setMarkAllBusy(false);
    }
  }

  return (
    <section className="wrap page-section motion-enter">
      <PageHeader
        title="Notifications"
        breadcrumbLabel="Notifications"
        trail={[
          { label: 'Home', to: '/' },
          { label: 'My Account', to: '/account' },
        ]}
      />

      {state.status === 'loading' && (
        <p role="status">Loading notifications…</p>
      )}

      {state.status === 'error' && (
        <div role="alert"><p>{state.message}</p><button type="button" onClick={() => { setState({status: 'loading'}); void loadNotificationsList(); }}>Try again</button></div>
      )}

      {state.status === 'ready' && state.notifications.length === 0 && (
        <div className="notifications-empty">
          <p>No notifications yet.</p>
          <p className="small-note">
            You'll receive notifications about your order status changes here.
          </p>
          <Link to="/account/orders" className="button">View your orders</Link>
        </div>
      )}

      {state.status === 'ready' && state.notifications.length > 0 && (
        <>
          <div className="notifications-header">
            <p className="notifications-count">
              {state.notifications.filter(n => !n.is_read).length} unread notification{state.notifications.filter(n => !n.is_read).length !== 1 ? 's' : ''}
            </p>
            {state.notifications.some(n => !n.is_read) && (
              <button
                className="text-link"
                onClick={() => void handleMarkAllRead()}
                disabled={markAllBusy || busy !== null}
              >
                {markAllBusy ? 'Marking…' : 'Mark all as read'}
              </button>
            )}
          </div>

          <ul className="notifications-list" aria-label="Notifications">
            {state.notifications.map(notification => (
              <li 
                key={notification.id}
                className={`notification-item ${notification.is_read ? 'read' : 'unread'} ${isTerminalNotification(notification.event_type) ? 'terminal' : ''}`}
              >
                <div className="notification-icon" aria-hidden="true">
                  {notificationIcon(notification.event_type)}
                </div>
                <div className="notification-content">
                  <strong className="notification-title">{notification.title}</strong>
                  <p className="notification-message">{notification.message}</p>
                  <time 
                    dateTime={notification.created_at}
                    className="notification-time"
                    title={new Date(notification.created_at).toLocaleString('en-GB')}
                  >
                    {formatNotificationTime(notification.created_at)}
                  </time>
                </div>
                <div className="notification-actions">
                  <button
                    className="notification-toggle-read"
                    onClick={() => void handleToggleRead(notification)}
                    disabled={busy !== null || markAllBusy}
                    aria-label={notification.is_read ? 'Mark as unread' : 'Mark as read'}
                    title={notification.is_read ? 'Mark as unread' : 'Mark as read'}
                  >
                    {busy === notification.id ? '…' : notification.is_read ? '○' : '●'}
                  </button>
                  <Link 
                    to={`/account/orders/${notification.order_id}`}
                    className="notification-link"
                    aria-label={`View order for ${notification.title}`}
                  >
                    View →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
