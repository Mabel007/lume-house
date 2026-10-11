import {useEffect,useState} from 'react';
import {Link,NavLink,Route,Routes} from 'react-router-dom';
import {getSupabaseClient} from '../../lib/supabase/client';
import {formatMoney} from '../../config/shop';
import {adminReadFailure,adminRpc} from './adminRepository';
import {parseStaffDashboard,parseStaffOrders} from './businessAccess';
import {AdminProfile} from './AdminProfile';
import './pagination.css';

export function StaffOverview({token}:{token:string}){
 const [revision,setRevision]=useState(0);const scope=JSON.stringify([token,revision]);const [state,setState]=useState<{scope:string;data?:ReturnType<typeof parseStaffDashboard>;error?:string}>();
 useEffect(()=>{let active=true;void adminRpc(getSupabaseClient(),token,'staff_dashboard_v1').then(parseStaffDashboard).then(data=>{if(active)setState({scope,data});}).catch(cause=>{if(active)setState({scope,error:adminReadFailure(cause,'Operational summary')});});return()=>{active=false;};},[token,revision,scope]);
 const current=state?.scope===scope?state:undefined;
 return <section><h2>Operational summary</h2>{current?.data?<dl><dt>Open orders</dt><dd>{current.data.open_orders}</dd><dt>Completed orders</dt><dd>{current.data.completed_orders}</dd><dt>Cancelled orders</dt><dd>{current.data.cancelled_orders}</dd></dl>:current?.error?<p role="alert">{current.error}</p>:<p role="status">Loading operational summary…</p>}<button onClick={()=>setRevision(v=>v+1)}>Reload summary</button></section>;
}
export function StaffOrders({token}:{token:string}){
 const [page,setPage]=useState(0);const [revision,setRevision]=useState(0);const [state,setState]=useState<{scope:string;data?:ReturnType<typeof parseStaffOrders>;error?:string}>();const scope=JSON.stringify([token,page,revision]);
 useEffect(()=>{let active=true;void adminRpc(getSupabaseClient(),token,'staff_orders_page_v1',{p_page:page}).then(parseStaffOrders).then(data=>{if(active)setState({scope,data});}).catch(cause=>{if(active)setState({scope,error:adminReadFailure(cause,'Order summary')});});return()=>{active=false;};},[token,page,revision,scope]);
 const current=state?.scope===scope?state:undefined;
 return <section><h2>Order summaries</h2><p>Read-only operational information.</p>{current?.data?current.data.items.length?<table><caption>Orders, page {page+1}</caption><thead><tr><th scope="col">Reference</th><th scope="col">Date</th><th scope="col">Operational status</th><th scope="col">Amount</th></tr></thead><tbody>{current.data.items.map(order=><tr key={order.order_reference}><td>{order.order_reference}</td><td><time dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString('en-GB')}</time></td><td>{order.status.replaceAll('_',' ')}</td><td>{formatMoney(order.total_cents)}</td></tr>)}</tbody></table>:<p>No orders on this page.</p>:current?.error?<p role="alert">{current.error}</p>:<p role="status">Loading order summaries…</p>}
 <div className="admin-pagination"><button disabled={page===0} onClick={()=>setPage(v=>v-1)}>Previous page</button><button disabled={!current?.data?.has_more} onClick={()=>setPage(v=>v+1)}>Next page</button><button onClick={()=>setRevision(v=>v+1)}>Reload orders</button></div></section>;
}
export function StaffWorkspace({token}:{token:string}){
 return <div className="admin-workspace"><aside className="admin-sidebar"><nav className="admin-navigation" aria-label="Staff workspace"><ul><li><NavLink to="/admin" end>Overview</NavLink></li><li><NavLink to="/admin/orders" end>Orders</NavLink></li><li><NavLink to="/admin/profile">Own profile</NavLink></li></ul></nav></aside><div className="admin-content"><h1>Staff workspace</h1><div className="admin-screen"><Routes><Route index element={<StaffOverview key={token} token={token}/>}/><Route path="orders" element={<StaffOrders key={token} token={token}/>}/><Route path="profile" element={<AdminProfile token={token} role="staff"/>}/><Route path="*" element={<section><h2>Access unavailable</h2><p>Your staff access is limited to operational summaries and your own profile.</p><Link to="/admin">Back to Overview</Link></section>}/></Routes></div></div></div>;
}
