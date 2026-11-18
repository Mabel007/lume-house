import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../auth/AuthContext';
import { getUnreadCount } from './notificationRepository';
import './notifications.css';

export function NotificationBell() {
  const auth = useAuth();
  if (auth.loading || !auth.session) return null;
  return <CustomerBell key={auth.session.user.id + ':' + (auth.sessionGeneration ?? 0)} />;
}

function CustomerBell() {
  const [state, setState] = useState({count: 0, loading: true, failed: false});
  useEffect(() => {
    let active = true;
    let request = 0;
    async function load() {
      const ticket = ++request;
      try {
        const count = await getUnreadCount(getSupabaseClient());
        if (active && ticket === request) setState({count, loading: false, failed: false});
      } catch {
        if (active && ticket === request) setState({count: 0, loading: false, failed: true});
      }
    }
    void load();
    const timer = setInterval(() => { void load(); }, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const description = state.loading ? ' (loading)' : state.failed ? ' (unavailable)' : state.count > 0 ? ' (' + state.count + ' unread)' : '';
  return <Link to="/account/notifications" className="notification-bell" aria-label={'Notifications' + description} aria-busy={state.loading || undefined}>
    <span className="bell-icon" aria-hidden="true">🔔</span>
    {state.count > 0 && <span className="unread-badge" aria-hidden="true">{state.count > 99 ? '99+' : state.count}</span>}
  </Link>;
}
