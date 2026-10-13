import {AdminReadState} from './AdminReadState';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../auth/AuthContext';
import { shop } from '../../config/shop';
import { getSupabaseClient } from '../../lib/supabase/client';
import { checkBusinessAccess, type BusinessAccess } from './businessAccess';
import { StaffWorkspace } from './StaffWorkspace';
import { AdminWorkspace } from './AdminWorkspace';
import './admin.css';

function AdminGate({ children }: { children: ReactNode }) {
  return <div className="admin-access"><p className="eyebrow">Business administration</p><h1>Administration</h1>{children}</div>;
}

function AdminAccess({ token }: { token: string }) {
  const {signOut}=useAuth();const [confirmOut,setConfirmOut]=useState(false);
  const [revision,setRevision]=useState(0);
  const [state, setState] = useState<'loading' | 'denied' | BusinessAccess | 'error'>('loading');
  useEffect(() => {
    let active = true;
    checkBusinessAccess(getSupabaseClient(), token).then(access => { if (active) setState(access ?? 'denied'); })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [token,revision]);
  if (state === 'staff') return <StaffWorkspace token={token} />;
  if (state === 'legacy' || state === 'owner') return <AdminWorkspace token={token} role={state} />;
  return <AdminGate>
    {state === 'loading' && <p role="status">Checking administration access…</p>}
    <AdminReadState message={state==='error'?'Administration access could not be checked.':state==='denied'?'This account does not have business administration access.':''} retry={()=>{setState('loading');setRevision(value=>value+1);}} retryLabel="Retry access check"/>
    {(state==='denied'||state==='error')&&<><button className="button secondary" type="button" onClick={()=>setConfirmOut(true)}>Use another account</button><Link className="text-link" to="/account">Back to your Account</Link></>}
    {confirmOut&&<ConfirmDialog title="Switch account?" description="Sign out before choosing another Google account." confirmLabel="Sign out" onCancel={()=>setConfirmOut(false)} onConfirm={()=>{setConfirmOut(false);void signOut();}}/>}
  </AdminGate>;
}

export function AdminPage() {
  const { session, loading, signIn, error } = useAuth();
  const location=useLocation();
  const [starting,setStarting]=useState(false);
  async function enter(){setStarting(true);try{await signIn(location.pathname+location.search+location.hash);}finally{setStarting(false);}}
  return <section className="admin-page">
    <header className="admin-masthead">
      <Link to="/" className="brand" aria-label={`${shop.name} home`}>{shop.name}<span className="brand-dot" aria-hidden="true">✳</span></Link>
      <span className="admin-masthead-label">Administration</span>
      <Link to="/" className="admin-storefront-link">View Storefront <span aria-hidden="true">↗</span></Link>
    </header>
    {loading ? <AdminGate><p role="status">Restoring your session…</p></AdminGate> : session
      ? <AdminAccess key={`${session.user.id}:${session.access_token}`} token={session.access_token} />
      : <AdminGate><p className="admin-access-intro">A focused workspace for the day-to-day care of your shop.</p><p>Sign in with your authorized Google account to continue. Access is checked after sign-in.</p><button type="button" className="button" disabled={starting} onClick={()=>void enter()}>{starting?'Opening Google…':'Sign in to administration'}</button><p className="small-note">Customer shopping and orders remain in <Link className="text-link" to="/account">your Account</Link>.</p></AdminGate>}
    {error&&<p role="alert" className="admin-session-error">{error}</p>}
  </section>;
}
