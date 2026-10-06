import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getSupabaseClient } from '../../lib/supabase/client';
import { checkAdmin } from './adminRepository';

function AdminAccess({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'denied' | 'allowed' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    checkAdmin(getSupabaseClient(), token).then(allowed => { if (active) setState(allowed ? 'allowed' : 'denied'); })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [token]);
  if (state === 'loading') return <p role="status">Checking administration access…</p>;
  if (state === 'error') return <p role="alert">Administration access could not be checked. Reload to retry.</p>;
  if (state === 'denied') return <p>This account does not have business administration access.</p>;
  return <p>Business administration access is authorized. Operational tools will appear here.</p>;
}

export function AdminPage() {
  const { session, loading } = useAuth();
  return <section className="content-page"><p className="eyebrow">Lumé House / Business</p><h1>Administration</h1>
    {loading ? <p role="status">Restoring your session…</p> : session
      ? <AdminAccess key={`${session.user.id}:${session.access_token}`} token={session.access_token} />
      : <p>Sign in with your authorized Google account to continue. <Link to="/account">Go to Account</Link></p>}
  </section>;
}
