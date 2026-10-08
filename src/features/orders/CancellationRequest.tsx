import {AdminOperationError,adminRpc,adminReadFailure,isAdminDenied} from '../admin/adminRepository';
import { AdminForm } from '../admin/AdminForm';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { parseCancellation, type CancellationRequestRecord as Request } from './cancellation';
import './cancellation.css';
import './orderPresentation.css';
export function CancellationStatus({request}: {request: Request}) {
  const resolutionLabel = request.status === 'accepted' ? 'Order cancelled' : request.status === 'rejected' ? 'Request rejected' : 'Request closed';
  return <div role="status"><p>Cancellation request: {request.status}.</p><ol className="order-activity" aria-label="Cancellation request activity"><li><strong>Customer requested cancellation</strong><time dateTime={request.requested_at}>{new Date(request.requested_at).toLocaleString('en-GB')}</time>{request.reason && <p>Reason: {request.reason}</p>}<p>A request does not cancel the order or release stock.</p></li>{request.status !== 'pending' && <li><strong>{resolutionLabel}</strong>{request.resolved_at ? <time dateTime={request.resolved_at}>{new Date(request.resolved_at).toLocaleString('en-GB')}</time> : <p className="order-activity-note">Resolution time is not available in this record.</p>}{request.resolution && <p>{request.status === 'rejected' ? 'Customer-visible rejection reason: ' : 'Resolution: '}{request.resolution}</p>}</li>}</ol></div>;
}
export function CancellationRequest({orderId, status, token, admin = false,blocked=false,accessChanged}: {orderId: string; status: string; token: string; admin?: boolean;blocked?:boolean;accessChanged?:(denied:boolean)=>void}) {
  const [request, setRequest] = useState<Request | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting=useRef(false);const [typedReason,setTypedReason]=useState('');const [uncertain,setUncertain]=useState(false);
  const RequestForm=admin?AdminForm:'form';
  const pendingReason = useRef<string | null>(null);
  async function rpc(name:string,args:Record<string,unknown>) {
    const data=await adminRpc(getSupabaseClient(),token,name,args);const parsed=parseCancellation(data);
    if(!parsed||parsed.order_id!==orderId||(admin&&(parsed.status!=='rejected'||parsed.resolution!==args.p_reason))||(!admin&&parsed.reason!==args.p_reason))throw new Error('The cancellation request could not be confirmed. Reload to review it before retrying.');
    return parsed;
  }
  useEffect(()=>{let live=true;
    void adminRpc(getSupabaseClient(),token,admin?'admin_get_cancellation_request':'customer_get_cancellation_request',{p_order_id:orderId}).then(data=>{
      const parsed=parseCancellation(data);if(parsed&&parsed.order_id!==orderId)throw new Error('Invalid request response.');
      if(live){accessChanged?.(false);setRequest(parsed);setLoading(false);}
    }).catch(cause=>{if(live){if(admin&&isAdminDenied(cause))accessChanged?.(true);setRequest(null);setError(admin?adminReadFailure(cause,'Cancellation request'):'Cancellation request could not be loaded.');setLoading(false);}});
    return()=>{live=false;};
  },[orderId,token,admin,revision,accessChanged]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(submitting.current||blocked)return; const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (pendingReason.current !== null && pendingReason.current !== reason) {setError('Retry with the original reason, or reload to review your submitted request.'); return;}
    if (admin && !window.confirm('Reject this request? This does not change the order, payment or inventory.')) return;
    submitting.current=true;pendingReason.current = reason; setBusy(true); setError('');
    try {setRequest(await rpc(admin ? 'admin_reject_cancellation_request' : 'customer_cancellation_request', {p_order_id: orderId, p_reason: reason})); pendingReason.current = null;setUncertain(false); requestAnimationFrame(() => heading.current?.focus());}
    catch (cause) {setUncertain(true);if(admin&&isAdminDenied(cause))accessChanged?.(true);setError(admin&&cause instanceof AdminOperationError?cause.message:'The cancellation request could not be confirmed. Reload to review it before retrying.');}
    finally {submitting.current=false;setBusy(false);}
  }
  const eligible = ['placed','confirmed'].includes(status);
  const Heading = admin ? 'h3' : 'h2';
  if(blocked&&!error&&!loading)return null;
  return <section className="email-information"><Heading ref={heading} tabIndex={-1}>Cancellation request</Heading><p>A request is not immediate cancellation. Lumé House confirmation is required. Cancellation does not issue a refund.</p>
    {loading && <p role="status">Loading cancellation request…</p>}{error && <p role="alert" data-admin-uncertain={admin&&uncertain}>{error} <button onClick={() => {setLoading(true); setError(''); setRevision(r => r + 1);}}>Reload request</button></p>}
    {admin && uncertain && !error && <p data-admin-uncertain="true">The previous rejection was not confirmed. Review the request before retrying with the original reason.</p>}
    {!blocked && !loading && !error && request && <CancellationStatus request={request} />}
    {!blocked && !loading && !error && !request && admin && <p>No cancellation request submitted.</p>}
    {!loading && !error && !admin && !request && !eligible && <p>This order is no longer eligible for a cancellation request.</p>}
    {!blocked && !loading && !error && ((!blocked && admin && request?.status === 'pending') || (!admin && !request && eligible)) && <RequestForm className="form-grid cancellation-form" onSubmit={submit} {...(admin?{busy}: {})}><label>{admin ? 'Customer-visible rejection reason' : 'Reason (optional)'}<textarea name="reason" required={admin} maxLength={500} value={typedReason} onChange={event=>setTypedReason(event.target.value)} disabled={busy}/></label><button className="button" disabled={busy}>{busy ? 'Submitting…' : admin ? 'Reject request' : 'Request cancellation'}</button></RequestForm>}
    {!blocked && admin && request?.status === 'pending' && <p>{eligible ? 'Approve by using the existing cancellation transition in Order operations below. Reject request is a separate action; neither action verifies payment or issues a refund.' : 'The order has advanced. This request cannot bypass current cancellation rules.'}</p>}
  </section>;
}
