import {useEffect,useState} from 'react';
import {Link,NavLink,Route,Routes} from 'react-router-dom';
import {getSupabaseClient} from '../../lib/supabase/client';
import {formatMoney} from '../../config/shop';
import {adminReadFailure,adminRpc} from './adminRepository';
import {parseStaffDashboard,parseStaffOrders} from './businessAccess';
import {AdminProfile} from './AdminProfile';
import './pagination.css';
import { AdminTable } from './AdminTable';
import { AdminReadState } from './AdminReadState';
import { RecordTime } from '../../components/RecordTime';
import './adminDashboard.css';

export function StaffOverview({token}:{token:string}){
 const [revision,setRevision]=useState(0);const scope=JSON.stringify([token,revision]);const [state,setState]=useState<{scope:string;data?:ReturnType<typeof parseStaffDashboard>;error?:string}>();
 useEffect(()=>{let active=true;void adminRpc(getSupabaseClient(),token,'staff_dashboard_v1').then(parseStaffDashboard).then(data=>{if(active)setState({scope,data});}).catch(cause=>{if(active)setState({scope,error:adminReadFailure(cause,'Operational summary')});});return()=>{active=false;};},[token,revision,scope]);
 const current=state?.scope===scope?state:undefined;
 return <section className="admin-dashboard"><h2>Operational summary</h2><p>Your read-only overview of current order progress.</p><AdminReadState loading={!current} message={!current?'Loading operational summary…':current.error} retry={()=>setRevision(v=>v+1)} retryLabel="Retry operational summary"/>{current?.data&&<dl className="admin-metric-grid">{[{label:'Open orders',value:current.data.open_orders},{label:'Completed orders',value:current.data.completed_orders},{label:'Cancelled orders',value:current.data.cancelled_orders}].map(item=><div className="admin-metric-card" key={item.label}><dt>{item.label}</dt><dd className="admin-metric-value">{item.value}</dd></div>)}</dl>}<button className="button button-secondary" onClick={()=>setRevision(v=>v+1)}>Reload summary</button></section>;
}
export function StaffOrders({token}:{token:string}){
 const [page,setPage]=useState(0);const [revision,setRevision]=useState(0);const [state,setState]=useState<{scope:string;data?:ReturnType<typeof parseStaffOrders>;error?:string}>();const scope=JSON.stringify([token,page,revision]);
 useEffect(()=>{let active=true;void adminRpc(getSupabaseClient(),token,'staff_orders_page_v1',{p_page:page}).then(parseStaffOrders).then(data=>{if(active)setState({scope,data});}).catch(cause=>{if(active)setState({scope,error:adminReadFailure(cause,'Order summary')});});return()=>{active=false;};},[token,page,revision,scope]);
 const current=state?.scope===scope?state:undefined;
 return <section><h2>Order summaries</h2><p>Read-only operational information.</p>{current?.data?current.data.items.length?<AdminTable caption={`Orders, page ${page+1}`} rows={current.data.items} rowKey={order=>order.order_reference} columns={[{key:'reference',heading:'Reference',rowHeader:true,render:order=>order.order_reference},{key:'date',heading:'Placed (UTC)',render:order=><RecordTime value={order.created_at}/>},{key:'status',heading:'Operational status',render:order=>order.status.replaceAll('_',' ')},{key:'amount',heading:'Amount',numeric:true,render:order=>formatMoney(order.total_cents)}]}/>:<AdminReadState empty="No orders on this page."/>:<AdminReadState loading={!current} message={!current?'Loading order summaries…':current.error} retry={()=>setRevision(v=>v+1)} retryLabel="Retry order summaries"/>}
 <div className="admin-pagination"><button disabled={page===0} onClick={()=>setPage(v=>v-1)}>Previous page</button><button disabled={!current?.data?.has_more} onClick={()=>setPage(v=>v+1)}>Next page</button><button onClick={()=>setRevision(v=>v+1)}>Reload orders</button></div></section>;
}
export function StaffWorkspace({token}:{token:string}){
 return <div className="admin-workspace"><aside className="admin-sidebar"><nav className="admin-navigation" aria-label="Staff workspace"><ul><li><NavLink to="/admin" end>Overview</NavLink></li><li><NavLink to="/admin/orders" end>Orders</NavLink></li><li><NavLink to="/admin/profile">Own profile</NavLink></li></ul></nav></aside><div className="admin-content"><header className="admin-workspace-header"><div><p className="admin-role-label">Staff · Read-only access</p><h1>Staff workspace</h1></div><Link className="button button-secondary" to="/admin/profile">Own profile</Link></header><div className="admin-screen"><Routes><Route index element={<StaffOverview key={token} token={token}/>}/><Route path="orders" element={<StaffOrders key={token} token={token}/>}/><Route path="profile" element={<AdminProfile token={token} role="staff"/>}/><Route path="*" element={<section><h2>Access unavailable</h2><p>Your staff access is limited to operational summaries and your own profile.</p><Link to="/admin">Back to Overview</Link></section>}/></Routes></div></div></div>;
}
