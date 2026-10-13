import {AdminReadState} from './AdminReadState';
import {RecordTime} from '../../components/RecordTime';
import {adminReadFailure,isAdminDenied} from './adminRepository';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { orderLabel } from '../orders/orders';
import { loadAdminOrderHistory, type OrderHistoryEvent } from './adminOrders';
import '../orders/orderPresentation.css';

export type HistoryState = { status: 'loading' } | { status: 'error'; message?:string } | { status: 'ready'; events: OrderHistoryEvent[] };
export function OrderTimeline({ state, retry }: { state: HistoryState; retry: () => void }) {
  return <section aria-labelledby="operational-history-heading"><h3 id="operational-history-heading">Operational history</h3><p className="order-activity-note">Recorded order transitions, separate from payment and cancellation requests. Up to the 100 most recent transitions are shown, oldest first within this history window.</p>
    {state.status === 'loading' ? <AdminReadState loading message="Loading operational history…"/> : state.status === 'error' ? <AdminReadState message={state.message||'Operational history could not be loaded.'} retry={retry} retryLabel="Retry history"/> : state.events.length === 0 ? <p>No recorded operational transitions.</p> : <ol className="order-activity">{[...state.events].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at) || a.operation_id.localeCompare(b.operation_id)).map(event=><li key={event.operation_id}><strong>{orderLabel(event.from_status)} → {orderLabel(event.to_status)}</strong><RecordTime value={event.created_at}/><p>Reason: {event.reason}</p></li>)}</ol>}
  </section>;
}
export function AdminOrderTimeline({ id, token, accessChanged,blocked=false }: { id: string; token: string; accessChanged?:(denied:boolean)=>void;blocked?:boolean }) {
  const [state,setState] = useState<HistoryState>({status:'loading'});
  const [revision,setRevision] = useState(0);
  useEffect(()=>{let live=true;void loadAdminOrderHistory(getSupabaseClient(),token,id).then(events=>{if(live){accessChanged?.(false);setState({status:'ready',events});}}).catch(cause=>{if(live){if(isAdminDenied(cause))accessChanged?.(true);setState({status:'error',message:adminReadFailure(cause,'Operational history')});}});return()=>{live=false;};},[id,token,revision,accessChanged]);
  if(blocked&&state.status==='ready')return <p>Operational history is hidden until administration access is checked.</p>;
  return <OrderTimeline state={state} retry={()=>{setState({status:'loading'});setRevision(value=>value+1);}}/>;
}
