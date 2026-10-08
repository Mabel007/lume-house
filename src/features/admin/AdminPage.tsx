import {AdminReadState} from './AdminReadState';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { shop } from '../../config/shop';
import { getSupabaseClient } from '../../lib/supabase/client';
import { checkAdmin } from './adminRepository';
import { AdminWorkspace } from './AdminWorkspace';
import './admin.css';

function AdminGate({ children }: { children: ReactNode }) {
  return <div className="admin-access"><p className="eyebrow">Business administration</p><h1>Administration</h1>{children}</div>;
}

function AdminAccess({ token }: { token: string }) {
  const [revision,setRevision]=useState(0);
  const [state, setState] = useState<'loading' | 'denied' | 'allowed' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    checkAdmin(getSupabaseClient(), token).then(allowed => { if (active) setState(allowed ? 'allowed' : 'denied'); })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [token,revision]);
  if (state === 'allowed') return <AdminWorkspace token={token} />;
  return <AdminGate>
    {state === 'loading' && <p role="status">Checking administration access…</p>}
    <AdminReadState message={state==='error'?'Administration access could not be checked.':state==='denied'?'This account does not have business administration access.':''} retry={()=>{setState('loading');setRevision(value=>value+1);}} retryLabel="Retry access check"/>
  </AdminGate>;
}

export function AdminPage() {
  const { session, loading } = useAuth();
  return <section className="admin-page">
    <header className="admin-masthead">
      <Link to="/" className="brand" aria-label={`${shop.name} home`}>{shop.name}<span className="brand-dot" aria-hidden="true">✳</span></Link>
      <span className="admin-masthead-label">Administration</span>
      <Link to="/" className="admin-storefront-link">View Storefront <span aria-hidden="true">↗</span></Link>
    </header>
    {loading ? <AdminGate><p role="status">Restoring your session…</p></AdminGate> : session
      ? <AdminAccess key={`${session.user.id}:${session.access_token}`} token={session.access_token} />
      : <AdminGate><p>Sign in with your authorized Google account to continue.</p><Link className="button" to="/account">Go to Account</Link></AdminGate>}
  </section>;
}
