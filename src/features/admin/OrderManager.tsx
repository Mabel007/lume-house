import {columnSort} from './filters/columnSort';
import {RecordFilterControls} from './filters/RecordFilterControls';
import {recordPageRequest} from './filters/recordPageRequest';
import type {RecordFilters} from './filters/recordFilters';
import {filtersFromSearch,filterSearch} from './filters/recordFilters';
import {AdminCsvExport} from './AdminCsvExport';
import {RecordTime} from '../../components/RecordTime';
import {ManualFulfilment} from './ManualFulfilment';
import {AdminReadState} from './AdminReadState';
import {useAdminPage} from './useAdminPage';
import {AdminPagination} from './PaginationControls';
const orderKey = (row: AdminOrderListItem) => row.id;
import { AdminForm } from './AdminForm';
import { useAdminReturnFocus, type AdminErrorKind } from './adminFormBehavior';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {getSupabaseClient} from '../../lib/supabase/client';
import {formatMoney} from '../../config/shop';
import {orderLabel,orderStates,type Order} from '../orders/orders';
import {Link,useLocation,useParams,useSearchParams} from 'react-router-dom';
import {AdminOrderReadError,loadAdminOrder,confirmOrderTransition,parseAdminOrderList,orderFilters,orderListUrl,orderDetailUrl,type AdminOrderListItem} from './adminOrders';
import {CancellationRequest} from '../orders/CancellationRequest';
import {OrderSnapshot} from '../orders/OrderSnapshot';
import {adminRpc,adminErrorKind} from './adminRepository';
import {nextOperationalStatuses,orderTransitionConfirmation} from './orderOperations';
import { AdminOrderTimeline } from './OrderTimeline';

export function OrderOperations({order,token,saved,blocked=false}:{order:Order;token:string;saved:()=>void;blocked?:boolean}){
  const submitting=useRef(false);const [error,setError]=useState('');const [errorKind,setErrorKind]=useState<AdminErrorKind>('validation');const [busy,setBusy]=useState(false);
  const pending=useRef<{signature:string;id:string}|null>(null);
  const allowed=nextOperationalStatuses(order.status,order.fulfilment_method);
  async function transition(e:FormEvent<HTMLFormElement>){e.preventDefault();if(submitting.current||blocked)return;setErrorKind(pending.current?'uncertain':'validation');const data=new FormData(e.currentTarget);const to=String(data.get('status'));const reason=String(data.get('reason')??'').trim();if(!allowed.includes(to as typeof order.status)||!reason||reason.length>500){setError('Choose an allowed status and enter a reason of 1 to 500 characters.');return;}const signature=JSON.stringify([order.id,order.status,to,reason]);setError('');
    if(pending.current&&pending.current.signature!==signature){setError('Retry the same operation or reload and review order history before changing it.');return;}
    if(!pending.current&&!window.confirm(orderTransitionConfirmation(to)))return;
    pending.current??={signature,id:crypto.randomUUID()};submitting.current=true;setBusy(true);
    try{confirmOrderTransition(await adminRpc(getSupabaseClient(),token,'admin_transition_order',{p_order_id:order.id,p_expected_status:order.status,p_to_status:to,p_reason:reason,p_operation_id:pending.current.id}),order,to);pending.current=null;saved();}
    catch(cause){setErrorKind(adminErrorKind(cause,true));setError(cause instanceof Error?cause.message:'Transition failed.');}finally{submitting.current=false;setBusy(false);}
  }
  return <section hidden={blocked} className="admin-form"><h3>Order operations</h3><p>Operational status is separate from payment. This application does not process or verify Orange Money/Afrimoney payments. Cancellation does not issue a refund.</p>
    {allowed.length?<AdminForm blocked={blocked} onSubmit={transition} busy={busy} error={error} errorKind={errorKind}><label>Next operational status<select name="status">{allowed.map(s=><option key={s} value={s}>{orderLabel(s)}</option>)}</select></label><label>Reason<textarea name="reason" required maxLength={500}/></label><button className="button" disabled={busy}>{busy?'Updating…':'Update order status'}</button></AdminForm>:<p>No further operational transitions are available.</p>}

  </section>;
}
type DetailState = { status: 'loading' } | { status: 'missing' } | { status: 'denied' } | { status: 'error' } | { status: 'ready'; order: Order };
export function AdminOrderDetailState({state,token,saved,retry}:{state:DetailState;token:string;saved:()=>void;retry:()=>void}) {
  const [historyDenied,setHistoryDenied]=useState(false);const [requestDenied,setRequestDenied]=useState(false);const [fulfilmentDenied,setFulfilmentDenied]=useState(false);const blocked=historyDenied||requestDenied||fulfilmentDenied;
  if (state.status === 'loading') return <p role="status">Loading order details…</p>;
  if (state.status === 'missing') return <p role="status">Order not found. Check the link or return to the order list.</p>;
  if (state.status === 'denied') return <AdminReadState message="Administration access was denied. Private data and actions are hidden." retry={retry} retryLabel="Retry loading order"/>;
  if (state.status === 'error') return <p role="alert">Order details could not be loaded. <button onClick={retry}>Retry loading order</button></p>;
  const {order} = state;
  return <>{!blocked&&<><h2>{order.order_reference}</h2><OrderSnapshot order={order} context="admin"/></>}<CancellationRequest key={`${order.id}:${order.status}:request`} orderId={order.id} status={order.status} token={token} admin blocked={blocked} accessChanged={setRequestDenied}/><OrderOperations key={`${order.id}:${order.status}`} order={order} token={token} saved={saved} blocked={blocked}/>{order.fulfilment_method==='delivery'?<ManualFulfilment orderId={order.id} token={token} blocked={blocked} accessChanged={setFulfilmentDenied}/>:!blocked&&<p>Courier and tracking fields apply only to delivery orders.</p>}<AdminOrderTimeline id={order.id} token={token} accessChanged={setHistoryDenied} blocked={blocked}/></>;
}
function AdminOrderDetail({id,token}:{id:string;token:string}) {
  const [state,setState]=useState<DetailState>({status:'loading'});
  const [revision,setRevision]=useState(0);const [notice,setNotice]=useState('');const [noticeSequence,setNoticeSequence]=useState(0);const noticeTarget=useRef<HTMLParagraphElement>(null);useAdminReturnFocus(notice,noticeTarget,noticeSequence);
  useEffect(()=>{
    let active=true;
    loadAdminOrder(getSupabaseClient(),token,id)
      .then(order=>{if(active)setState({status:'ready',order});})
      .catch(cause=>{if(active)setState({status:cause instanceof AdminOrderReadError?cause.kind:'error'});});
    return()=>{active=false;};
  },[id,token,revision]);
  function reload(){setState({status:'loading'});setRevision(value=>value+1);}
  return <>{notice&&<p role="status" ref={noticeTarget} tabIndex={-1}>{notice}</p>}<AdminOrderDetailState state={state} token={token} saved={()=>{setNoticeSequence(value=>value+1);setNotice('Order operation confirmed. Payment status is unchanged. Reloading current order.');reload();}} retry={()=>{setNotice('');reload();}}/></>;
}
export function AdminOrderDetailPage({token}:{token:string}) {
  const {orderId=''}=useParams();const {search}=useLocation();
  return <section className="admin-order-detail"><Link className="back-link" to={orderListUrl(search)}>Back to orders</Link><AdminOrderDetail key={`${orderId}:${token}`} id={orderId} token={token}/></section>;
}
export function AdminOrderList({orders,search,sortBy='created_at',direction='desc',onSort}:{orders:AdminOrderListItem[];search:string;sortBy?:string;direction?:string;onSort?:(key:string)=>void}) {
  return <AdminTable caption="Customer orders" className="admin-order-list" rows={orders} rowKey={order=>order.id} columns={[
    {...columnSort(sortBy,direction,onSort,'reference'),key:'reference',heading:'Reference / customer',rowHeader:true,render:order=><div className="admin-order-identity"><Link className="admin-order-link" to={orderDetailUrl(order.id,search)}>{order.order_reference}</Link><span>{order.full_name}</span></div>},
    {...columnSort(sortBy,direction,onSort,'created_at'),key:'date',heading:'Placed (UTC)',render:order=><RecordTime value={order.created_at}/>},
    {key:'fulfilment',heading:'Fulfilment',render:order=>order.fulfilment_method==='pickup'?'Pickup':'Delivery'},
    {...columnSort(sortBy,direction,onSort,'status'),key:'status',heading:'Operational status',render:order=><span className="status-pill">{orderLabel(order.status)}</span>},
    {key:'payment',heading:'Payment status',render:order=><span className="status-pill payment-pill">{orderLabel(order.payment_status)}</span>},
    {...columnSort(sortBy,direction,onSort,'total'),key:'total',heading:'Total',numeric:true,render:order=>formatMoney(order.total_cents)},
    {key:'actions',heading:'Details',render:order=><Link className="ui-detail-action" aria-label={`View details for ${order.order_reference}`} to={orderDetailUrl(order.id,search)}><EyeIcon/>View details</Link>},
  ]}/>;
}
export function OrderManager({token}:{token:string}) {
  const [params,setParams]=useSearchParams();const search=params.toString();const {query,status}=orderFilters(search);
  let applied:RecordFilters;let filterError='';try{applied=filtersFromSearch('orders',search);}catch{applied={query,status};filterError='The saved URL contains invalid filters. Clear or correct the filters before reviewing results.';}const request=recordPageRequest('orders',applied);
  const pagination=useAdminPage(token,request.rpc,request.args,parseAdminOrderList,orderKey);
  const {rows:orders,error,loading}=pagination;
  return <section><h2>Order list</h2><p>Search and status filters apply to all authorized orders. Customer and fulfilment details are private business information.</p>
    <form className="admin-order-filters" key={`${query}:${status}`} onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);const next=new URLSearchParams(applied);next.delete('query');next.delete('status');const q=String(data.get('query'));const s=String(data.get('status'));if(q)next.set('query',q);if(s)next.set('status',s);setParams(next);}}><label>Search reference, customer name or email<input name="query" type="search" maxLength={200} defaultValue={query}/></label><label>Order status<select name="status" defaultValue={status}><option value="">All statuses</option>{orderStates.map(s=><option key={s} value={s}>{orderLabel(s)}</option>)}</select></label><div className="admin-filter-actions"><button className="button">Apply filters</button><button type="button" className="button secondary" onClick={()=>setParams(new URLSearchParams())}>Clear filters</button></div></form>
    <RecordFilterControls kind="orders" applied={applied} onApply={filters=>setParams(filterSearch(filters))}/><AdminCsvExport token={token} kind="orders" query={query} filters={request.rpc.endsWith('_v2')?applied:undefined} status={status} disabled={loading||Boolean(error)||Boolean(filterError)}/><AdminReadState loading={loading&&!filterError} message={filterError||(loading?(orders.length?'Refreshing orders…':'Loading orders…'):error)} retry={pagination.refresh} retryLabel="Retry loading orders"/>{!loading&&!error&&!filterError&&!orders.length&&<p>No matching orders.</p>}
    {!loading&&!error&&!filterError&&<><AdminOrderList orders={orders} search={search} sortBy={applied.sort||'created_at'} direction={applied.direction||'desc'} onSort={sort=>setParams(filterSearch({...applied,sort,direction:(applied.sort||'created_at')===sort&&(applied.direction||'desc')==='asc'?'desc':'asc'}))}/><AdminPagination {...pagination}/></>}
  </section>;
}
import { AdminTable } from './AdminTable';
import { EyeIcon } from '../../components/EyeIcon';
