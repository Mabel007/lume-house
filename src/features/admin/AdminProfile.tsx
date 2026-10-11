import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { accountInitials } from '../account/accountInitials';
import { getSupabaseClient } from '../../lib/supabase/client';
import { checkAdmin } from './adminRepository';
import { checkBusinessAccess, type BusinessAccess } from './businessAccess';
import { AdminReadState } from './AdminReadState';
import './adminProfile.css';
import { ConfirmDialog } from '../../components/ConfirmDialog';

function displayName(value: unknown): string { return typeof value === 'string' && value.trim().length <= 200 ? value.trim() : ''; }
export function AdminProfile({ token, role='legacy' }: { token: string; role?: BusinessAccess }) {
 const auth = useAuth();
 const id = auth.session?.user.id;
 const scope = JSON.stringify([token, id]);
 const [revision, setRevision] = useState(0);
 const [access, setAccess] = useState<{ scope: string; revision: number; status: 'ready' | 'denied' | 'error' }>();
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [confirmOut, setConfirmOut] = useState(false);
 useEffect(() => {
  if (!id) return;
  let active = true;
  const allowed=role==='staff'?checkBusinessAccess(getSupabaseClient(),token).then(value=>value==='staff'):checkAdmin(getSupabaseClient(), token);
  void allowed.then(allowed => { if (active) setAccess({ scope, revision, status: allowed ? 'ready' : 'denied' }); }).catch(() => { if (active) setAccess({ scope, revision, status: 'error' }); });
  return () => { active = false; };
 }, [token, id, scope, revision, role]);
 if (!auth.session) return <section><h2>Admin Profile</h2><p>Sign in to view your administration profile.</p><Link to="/account">Go to Account</Link></section>;
 const current = access?.scope === scope && access.revision === revision ? access.status : 'loading';
 if (current !== 'ready') return <section><h2>Admin Profile</h2><AdminReadState loading={current === 'loading'} message={current === 'loading' ? 'Checking your administration access…' : current === 'denied' ? 'Administration access was denied. Profile details are hidden.' : 'Your administration access could not be checked.'} retry={() => setRevision(value => value + 1)} retryLabel="Retry profile access"/></section>;
 const user = auth.session.user;
 const name = displayName(user.user_metadata?.full_name) || displayName(user.user_metadata?.name) || 'Your admin account';
 const provider = user.app_metadata?.provider === 'google' ? 'Google' : 'Sign-in provider information unavailable';
 async function leave() {
  if (busy) return;
  setBusy(true); setError('');
  try { await auth.signOut(); } catch { setError('Sign-out failed. Please try again.'); } finally { setBusy(false); }
 }
 return <section className="admin-profile"><h2>Admin Profile</h2>
  <header className="admin-profile-identity"><span className="admin-profile-avatar" aria-hidden="true">{accountInitials(name === 'Your admin account' ? '' : name)}</span><div><h3>{name}</h3><p>{user.email || 'Email information unavailable'}</p><p>Sign-in provider: {provider}</p></div></header>
  <div className="admin-profile-sections"><section className="admin-profile-card" aria-labelledby="admin-profile-access"><h3 id="admin-profile-access">Business access</h3>{role==='legacy'&&<p>Active business-admin membership</p>}<p>{role==='staff'?'Staff: read-only operational summaries and your own profile.':role==='owner'?'Owner: full business administration access.':'Your current authenticated account has administration access. All active business admins use the same permissions.'}</p>{role!=='staff'&&<Link to="/admin/memberships">View admin access</Link>}</section>
  <section className="admin-profile-card" aria-labelledby="admin-profile-security"><h3 id="admin-profile-security">Account &amp; Security</h3><p>Your name, email and sign-in identity are read-only here.</p>{provider === 'Google' && <p>Google manages your sign-in. Lumé House does not provide a password editor for this account.</p>}<button type="button" className="button" data-admin-leave="true" disabled={busy} onClick={() => setConfirmOut(true)}>{busy ? 'Signing out…' : 'Sign Out'}</button>{(error || auth.error) && <p role="alert">{error || auth.error}</p>}</section></div>
 {confirmOut && <ConfirmDialog title="Sign out?" description="End your current session on this device." confirmLabel="Sign out" onCancel={()=>setConfirmOut(false)} onConfirm={()=>{setConfirmOut(false);void leave();}}/>}</section>;
}
