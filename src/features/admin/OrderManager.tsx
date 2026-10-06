import {useEffect,useRef,useState,type FormEvent} from 'react';
import {getSupabaseClient} from '../../lib/supabase/client';
import {formatMoney} from '../../config/shop';
import {orderLabel,orderStates,parseOrder,parseOrderList,type Order,type OrderListItem} from '../orders/orders';
import {OrderSnapshot} from '../orders/OrderPages';
import {adminRpc} from './adminRepository';
import {nextOperationalStatuses} from './orderOperations';

export function OrderOperations({order,token,saved}:{order:Order;token:string;saved:()=>void}){
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const pending=useRef<{signature:string;id:string}|null>(null);
  const allowed=nextOperationalStatuses(order.status,order.fulfilment_method);
  async function transition(e:FormEvent<HTMLFormElement>){e.preventDefault();const data=new FormData(e.currentTarget);const to=String(data.get('status'));const reason=String(data.get('reason')).trim();const signature=JSON.stringify([order.id,order.status,to,reason]);setError('');
    if(pending.current&&pending.current.signature!==signature){setError('Retry the same operation or reload and review order history before changing it.');return;}
    if(!pending.current&&!window.confirm(`Change this order to ${orderLabel(to)}? Payment status will not change.${to==='cancelled'?' This releases allocated stock; it does not issue a refund.':to==='completed'?' This consumes allocated stock.':''}`))return;
    pending.current??={signature,id:crypto.randomUUID()};setBusy(true);
    try{await adminRpc(getSupabaseClient(),token,'admin_transition_order',{p_order_id:order.id,p_expected_status:order.status,p_to_status:to,p_reason:reason,p_operation_id:pending.current.id});pending.current=null;saved();}
    catch(cause){setError(cause instanceof Error?cause.message:'Transition failed.');}finally{setBusy(false);}
  }
  return <section className="admin-form"><h3>Order operations</h3><p>Operational status is separate from payment. This application does not process or verify Orange Money/Afrimoney payments. Cancellation does not issue a refund.</p>
    {allowed.length?<form onSubmit={transition}><label>Next operational status<select name="status">{allowed.map(s=><option key={s} value={s}>{orderLabel(s)}</option>)}</select></label><label>Reason<textarea name="reason" required maxLength={500}/></label><button className="button" disabled={busy}>{busy?'Updating…':'Update order status'}</button></form>:<p>No further operational transitions are available.</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
function AdminOrderDetail({id,token,changed}:{id:string;token:string;changed:()=>void}){
  const [order,setOrder]=useState<Order|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);const [history,setHistory]=useState<{operation_id:string;from_status:string;to_status:string;reason:string;created_at:string}[]>([]);
  useEffect(()=>{let active=true;Promise.all([adminRpc(getSupabaseClient(),token,'admin_get_order',{p_order_id:id}),adminRpc(getSupabaseClient(),token,'admin_order_history',{p_order_id:id})]).then(([data,events])=>{const parsed=parseOrder(data);if(!Array.isArray(events))throw new Error('Invalid operation history.');if(active){setOrder(parsed);setHistory(events);}}).catch(cause=>{if(active)setError(cause.message);});return()=>{active=false;};},[id,token,revision]);
  if(error)return <p role="alert">{error}</p>;
  if(!order)return <p role="status">Loading order details…</p>;
  return <section><h3>{order.order_reference}</h3><OrderSnapshot order={order}/><OrderOperations key={`${order.id}:${order.status}`} order={order} token={token} saved={()=>{setRevision(r=>r+1);changed();}}/><h3>Operational history</h3><ul className="admin-list">{history.map(h=><li key={h.operation_id}>{h.created_at}: {orderLabel(h.from_status)} → {orderLabel(h.to_status)}. {h.reason}</li>)}</ul></section>;
}
export function OrderManager({token}:{token:string}){
  const [orders,setOrders]=useState<OrderListItem[]>([]);const [selected,setSelected]=useState<string|null>(null);const [filters,setFilters]=useState({query:'',status:''});const [revision,setRevision]=useState(0);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;adminRpc(getSupabaseClient(),token,'admin_list_orders',{p_query:filters.query,p_status:filters.status}).then(data=>{if(!Array.isArray(data))throw new Error('Invalid order list.');const parsed=data.map(parseOrderList);if(active){setOrders(parsed);setLoading(false);}}).catch(cause=>{if(active){setError(cause.message);setLoading(false);}});return()=>{active=false;};},[token,filters,revision]);
  return <section><h2>Orders</h2><p>Showing up to 200 matching orders. Customer and fulfilment details are private business information.</p>
    <form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);setFilters({query:String(data.get('query')),status:String(data.get('status'))});}}><label>Search reference, customer name or email<input name="query" type="search" maxLength={200}/></label><label>Order status<select name="status"><option value="">All statuses</option>{orderStates.map(s=><option key={s} value={s}>{orderLabel(s)}</option>)}</select></label><button className="button">Apply filters</button></form>
    {loading&&<p role="status">Loading orders…</p>}{error&&<p role="alert">{error}</p>}{!loading&&!error&&!orders.length&&<p>No matching orders.</p>}
    <ul className="admin-list">{orders.map(o=><li key={o.id}><button onClick={()=>setSelected(o.id)}>{o.order_reference} — {orderLabel(o.status)} — Payment: {orderLabel(o.payment_status)} — {formatMoney(o.total_cents)}</button></li>)}</ul>
    {selected&&<AdminOrderDetail key={selected} id={selected} token={token} changed={()=>setRevision(r=>r+1)}/>}
  </section>;
}
