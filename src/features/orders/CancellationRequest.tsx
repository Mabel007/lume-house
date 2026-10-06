import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { parseCancellation, type CancellationRequestRecord as Request } from './cancellation';
import './cancellation.css';
export function CancellationStatus({request}: {request: Request}) {
  return <div role="status"><p>Cancellation request: {request.status === 'accepted' ? 'Order cancelled' : request.status}.</p><p>Requested: {new Date(request.requested_at).toLocaleString('en-GB')}</p>{request.reason && <p>Reason: {request.reason}</p>}{request.resolution && <p>{request.resolution}</p>}</div>;
}
export function CancellationRequest({orderId, status, token, admin = false}: {orderId: string; status: string; token: string; admin?: boolean}) {
  const [request, setRequest] = useState<Request | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const pendingReason = useRef<string | null>(null);
  async function rpc(name: string, args: Record<string, unknown>) {
    const {data, error} = await getSupabaseClient().rpc(name, args).setHeader('Authorization', `Bearer ${token}`);
    if (error) throw new Error('The cancellation request could not be confirmed. Reload to review it before retrying.');
    return parseCancellation(data);
  }
  useEffect(() => {let live = true;
    const name = admin ? 'admin_get_cancellation_request' : 'customer_get_cancellation_request';
    const client = getSupabaseClient();
    void Promise.resolve(client.rpc(name, {p_order_id: orderId}).setHeader('Authorization', `Bearer ${token}`)).then(({data, error}) => {
      if (error) throw new Error('Request could not be loaded.');
      const parsed = parseCancellation(data); if (live) {setRequest(parsed); setLoading(false);}
    }).catch(() => {if (live) {setError('Cancellation request could not be loaded.'); setLoading(false);}});
    return () => {live = false;};
  }, [orderId, token, admin, revision]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (pendingReason.current !== null && pendingReason.current !== reason) {setError('Retry with the original reason, or reload to review your submitted request.'); return;}
    if (admin && !window.confirm('Reject this request? This does not change the order, payment or inventory.')) return;
    pendingReason.current = reason; setBusy(true); setError('');
    try {setRequest(await rpc(admin ? 'admin_reject_cancellation_request' : 'customer_cancellation_request', {p_order_id: orderId, p_reason: reason})); pendingReason.current = null;}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Request failed.');}
    finally {setBusy(false);}
  }
  const eligible = ['placed','confirmed'].includes(status);
  return <section className="email-information"><h3>Cancellation request</h3><p>A request is not immediate cancellation. Lumé House confirmation is required. Cancellation does not issue a refund.</p>
    {loading && <p role="status">Loading cancellation request…</p>}{error && <p role="alert">{error} <button onClick={() => {setLoading(true); setError(''); setRevision(r => r + 1);}}>Reload request</button></p>}
    {!loading && !error && request && <CancellationStatus request={request} />}
    {!loading && !error && !request && admin && <p>No cancellation request submitted.</p>}
    {!loading && !error && !admin && !request && !eligible && <p>This order is no longer eligible for a cancellation request.</p>}
    {!loading && !error && ((admin && request?.status === 'pending') || (!admin && !request && eligible)) && <form className="form-grid cancellation-form" onSubmit={submit}><label>{admin ? 'Customer-visible rejection reason' : 'Reason (optional)'}<textarea name="reason" required={admin} maxLength={500} /></label><button className="button" disabled={busy}>{busy ? 'Submitting…' : admin ? 'Reject request' : 'Request cancellation'}</button></form>}
    {admin && request?.status === 'pending' && <p>{eligible ? 'Use the trusted Cancel order operation below if approved.' : 'The order has advanced. This request cannot bypass current cancellation rules.'}</p>}
  </section>;
}
