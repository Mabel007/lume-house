import { useEffect, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { adminRpc } from './adminRepository';
type Membership = {user_id: string; active: boolean; created_at: string | null; updated_at: string};
type MembershipEvent = {id: string; user_id: string; actor_user_id: string | null; active: boolean; reason: string; created_at: string};
export function MembershipManager({token}: {token: string}) {
  const [members, setMembers] = useState<Membership[]>([]); const [history, setHistory] = useState<MembershipEvent[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => { let live = true;
    Promise.all([adminRpc(getSupabaseClient(), token, 'admin_list_memberships'), adminRpc(getSupabaseClient(), token, 'admin_membership_history')]).then(([rows, events]) => {
      if (!Array.isArray(rows) || !Array.isArray(events) || rows.some(r => !r || typeof r.user_id !== 'string' || typeof r.active !== 'boolean' || typeof r.updated_at !== 'string')) throw new Error('Invalid memberships response.');
      if (live) {setMembers(rows); setHistory(events); setLoading(false);}
    }).catch(() => {if (live) {setMembers([]); setHistory([]); setError('Memberships could not be loaded.'); setLoading(false);}});
    return () => {live = false;};
  }, [token, revision]);
  function reload() {setLoading(true); setError(''); setRevision(r => r + 1);}
  async function revoke(e: FormEvent<HTMLFormElement>, member: Membership) {
    e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason')).trim();
    if (!window.confirm('Revoke this membership? Trusted business access will stop. You cannot revoke yourself.')) return;
    setBusy(true); setError('');
    try {await adminRpc(getSupabaseClient(), token, 'admin_revoke_membership', {p_user_id: member.user_id, p_expected_updated_at: member.updated_at, p_reason: reason}); reload();}
    catch {setError('Revocation could not be confirmed. Reload and review membership history before retrying.');}
    finally {setBusy(false);}
  }
  return <section><h2>Admin memberships</h2><p>Provisioning and first-admin recovery remain privileged service-only operations. Customer emails and Auth credentials are not exposed here. Self-revocation is disabled.</p>
    {loading && <p role="status">Loading memberships…</p>}{error && <p role="alert">{error} <button onClick={reload}>Reload memberships</button></p>}
    {!loading && !error && <><ul className="admin-list">{members.map(m => <li key={m.user_id}><strong>{m.user_id}</strong><p>{m.active ? 'Active' : 'Revoked'} · Provisioned: {m.created_at ?? 'Not recorded'} · Updated: {m.updated_at}</p>
      {m.active && <form className="admin-form" onSubmit={e => void revoke(e, m)}><label>Revocation reason<textarea name="reason" required maxLength={500} /></label><button className="button" disabled={busy}>Revoke membership</button></form>}
    </li>)}</ul>{!members.length && <p>No memberships found.</p>}<h3>Membership history</h3><p>Most recent 100 recorded changes. Older provisioning may predate this history.</p><ul className="admin-list">{history.map(h => <li key={h.id}>{h.created_at}: {h.user_id} — {h.active ? 'Provisioned' : 'Revoked'}. {h.reason} · Actor: {h.actor_user_id ?? 'Privileged service'}</li>)}</ul></>}
  </section>;
}
