import {AdminCsvExport} from './AdminCsvExport';
import {AdminReadState} from './AdminReadState';
import {parseAdminRows} from './adminValidation';
import {useAdminPage} from './useAdminPage';
import {AdminPagination} from './PaginationControls';
const inventoryKey = (row: InventoryRow) => row.variant_id;
import {parseAdminVariant} from './adminVariants';
import { AdminForm } from './AdminForm';
import { useAdminReturnFocus, type AdminErrorKind } from './adminFormBehavior';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../../lib/supabase/client';
import { adminRpc, adminErrorKind, adminReadFailure, isAdminDenied } from './adminRepository';
import { parseInventoryAdjustment, availableQuantity, adjustmentPreview,  inventoryOptions, parseInventoryRow, parseInventoryHistory, inventoryEventLabels, type InventoryRow, type InventoryHistoryRow } from './inventoryPresentation';
export type {InventoryRow} from './inventoryPresentation';
type HistoryState={status:'loading'|'ready'|'error';rows:InventoryHistoryRow[];message?:string};
export function InventoryBalances({row}:{row:InventoryRow}) {
 const available=availableQuantity(row);
 return <dl className="admin-inventory-balances"><div><dt>Inventory tracking</dt><dd>{row.inventory_policy==='tracked'?'Tracked':'Untracked'}</dd></div><div><dt>On hand</dt><dd>{row.on_hand??'Not configured'}</dd></div><div><dt>Allocated</dt><dd>{row.allocated??'Not configured'}</dd></div><div><dt>Available stock quantity</dt><dd>{available??(row.inventory_policy==='untracked'?'Untracked':'Not configured')}</dd></div></dl>;
}
export function InventoryHistory({state,retry}:{state:HistoryState;retry:()=>void}) {
 return <section><h4>Recent stock movement history</h4><p className="admin-field-help">Up to 100 most recent movements for this variant, newest first. This is not the complete ledger. Actor identities are not supplied.</p>
 <AdminReadState loading={state.status==='loading'} message={state.status==='loading'?'Loading inventory history…':state.status==='error'?state.message||'Inventory history could not be loaded.':''} retry={retry} retryLabel="Retry inventory history"/>
 {state.status==='ready'&&(state.rows.length?<ol className="admin-inventory-history">{state.rows.map(row=><li key={row.id}><strong>{inventoryEventLabels[row.event]}</strong><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time><p>{row.reason}</p><p>On-hand change: {row.on_hand_delta>0?'+':''}{row.on_hand_delta} · Allocation change: {row.allocated_delta>0?'+':''}{row.allocated_delta}</p><p>After movement — On hand: {row.on_hand_after} · Allocated: {row.allocated_after}</p>{row.order_id&&<Link to={`/admin/orders/${row.order_id}`}>Open related order</Link>}</li>)}</ol>:<p>No recorded stock movements for this variant.</p>)}</section>;
}
export function InventoryEditor({row,token,saved}:{row:InventoryRow;token:string;saved:()=>void}){
 const [operation,setOperation]=useState<'adjust'|'policy'>('adjust');const [error,setError]=useState('');const [errorKind,setErrorKind]=useState<AdminErrorKind>('validation');const [busy,setBusy]=useState(false);const submitting=useRef(false);const [delta,setDelta]=useState('');
 const [historyDenied,setHistoryDenied]=useState(false);const [reason,setReason]=useState('');const [tracking,setTracking]=useState(row.inventory_policy);
 const [history,setHistory]=useState<HistoryState>({status:'loading',rows:[]});const [revision,setRevision]=useState(0);
 const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>{heading.current?.focus();},[]);
 const pending=useRef<{signature:string;id:string}|null>(null);
 useEffect(()=>{let active=true;void adminRpc(getSupabaseClient(),token,'admin_inventory_history',{p_variant_id:row.variant_id}).then(data=>{const rows=parseAdminRows(data,parseInventoryHistory,row=>row.id,100);if(active){setHistoryDenied(false);setHistory({status:'ready',rows});}}).catch(cause=>{if(active){if(isAdminDenied(cause))setHistoryDenied(true);setHistory({status:'error',rows:[],message:adminReadFailure(cause,'Inventory history')});}});return()=>{active=false;};},[token,row.variant_id,revision]);
 async function adjust(event:FormEvent<HTMLFormElement>){event.preventDefault();if(submitting.current)return;setOperation('adjust');setErrorKind(pending.current?'uncertain':'validation');const data=new FormData(event.currentTarget);const amount=Number(data.get('delta'));const reason=String(data.get('reason')??'').trim();setError('');
  if(!/^-?\d+$/.test(String(data.get('delta')).trim())||!Number.isInteger(amount)||amount<-2147483648||amount>2147483647||!reason||reason.length>500){setError('Enter a supported whole-number change and a reason of 1 to 500 characters.');return;}
  const signature=JSON.stringify([row.variant_id,amount,reason]);if(pending.current&&pending.current.signature!==signature){setError('Retry the same adjustment or reload and review the ledger before changing it.');return;}
  // Keep the original operation ID on any uncertain outcome; preview is not trusted balance.
  pending.current??={signature,id:crypto.randomUUID()};submitting.current=true;setBusy(true);
  try{parseInventoryAdjustment(await adminRpc(getSupabaseClient(),token,'admin_adjust_inventory',{p_variant_id:row.variant_id,p_delta:amount,p_reason:reason,p_operation_id:pending.current.id}));pending.current=null;saved();}
  catch(cause){setErrorKind(adminErrorKind(cause,true));setError(cause instanceof Error?cause.message:'Adjustment failed.');}finally{submitting.current=false;setBusy(false);}
 }
 async function policy(event:FormEvent<HTMLFormElement>){event.preventDefault();if(submitting.current)return;setOperation('policy');setErrorKind(pending.current?'uncertain':'validation');if(pending.current){setError('Resolve or review the pending adjustment before changing policy.');return;}const data=new FormData(event.currentTarget);submitting.current=true;setBusy(true);setError('');
  try{const result=parseAdminVariant(await adminRpc(getSupabaseClient(),token,'admin_set_inventory_policy',{p_variant_id:row.variant_id,p_policy:data.get('policy'),p_expected_updated_at:row.updated_at}));if(result.id!==row.variant_id||result.inventory_policy!==data.get('policy'))throw new Error('Inventory policy save was not confirmed. Review the variant before retrying.');saved();}catch(cause){setErrorKind(adminErrorKind(cause,true));setError(cause instanceof Error?cause.message:'Policy failed.');}finally{submitting.current=false;setBusy(false);}
 }
 if(historyDenied)return <section data-admin-uncertain={Boolean(error)&&errorKind==='uncertain'}><AdminReadState loading={history.status==='loading'} message={history.status==='loading'?'Checking inventory access…':history.message} retry={()=>{setHistory({status:'loading',rows:[]});setRevision(value=>value+1);}} retryLabel="Retry inventory history" disabled={busy}/></section>;
 return <section className="admin-form admin-inventory-editor"><h3 ref={heading} tabIndex={-1}>{row.product_name} — {row.sku}</h3><p>{inventoryOptions(row)}</p><InventoryBalances row={row}/>
 <AdminForm onSubmit={adjust} busy={busy} error={operation==='adjust'?error:''} errorKind={errorKind}><fieldset disabled={busy}><legend>Stock adjustment</legend><label>Quantity change (integer)<input name="delta" type="number" step="1" min="-2147483648" max="2147483647" required value={delta} onChange={event=>setDelta(event.target.value)} aria-describedby="inventory-adjustment-preview"/></label><p id="inventory-adjustment-preview" role="status">{adjustmentPreview(row,delta)}</p><label>Reason<textarea name="reason" required maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label><p>Enter actual stock changes only. Zero explicitly prepares a known empty balance. The Bag does not reserve stock.</p><button className="button" disabled={busy}>Apply adjustment</button></fieldset></AdminForm>
 <AdminForm onSubmit={policy} busy={busy} error={operation==='policy'?error:''} errorKind={errorKind}><fieldset disabled={busy}><legend>Inventory policy</legend><label>Tracking<select name="policy" value={tracking} onChange={event=>setTracking(event.target.value as InventoryRow['inventory_policy'])}><option value="untracked">Untracked</option><option value="tracked">Tracked</option></select></label><p>Prepare actual stock before enabling tracking. Allocated stock must stay tracked. Tracking does not activate or archive a product or variant.</p><button className="button" disabled={busy}>Save inventory policy</button></fieldset></AdminForm>
 <InventoryHistory state={history} retry={()=>{setHistory({status:'loading',rows:[]});setRevision(value=>value+1);}}/>
 </section>;
}
export function InventoryWorklist({rows,select}:{rows:InventoryRow[];select:(row:InventoryRow)=>void}){
 return <ul className="admin-inventory-worklist">{rows.map(row=><li key={row.variant_id}><button type="button" className="admin-inventory-row" data-admin-leave="true" onClick={()=>select(row)}><span><strong>{row.product_name}</strong><span className="admin-inventory-identity">SKU: {row.sku}</span><span className="admin-inventory-identity">{inventoryOptions(row)}</span><span className="admin-inventory-identity">Variant state: {row.active?'Active':'Inactive'}</span><span className="admin-inventory-identity">Catalogue availability: {row.available?'Available':'Unavailable'}</span></span><span>Review stock and movements</span></button><InventoryBalances row={row}/></li>)}</ul>;
}
export function InventoryManager({token}:{token:string}){
 const [selected,setSelected]=useState<InventoryRow|null>(null);const [query,setQuery]=useState('');const [policy,setPolicy]=useState('');
 const pagination=useAdminPage(token,'admin_inventory_page_v1',{p_query:query,p_policy:policy},parseInventoryRow,inventoryKey);
 const {rows,error,loading}=pagination;
 const [notice,setNotice]=useState('');const [noticeSequence,setNoticeSequence]=useState(0);const noticeTarget=useRef<HTMLParagraphElement>(null);useAdminReturnFocus(notice,noticeTarget,noticeSequence);
 const visible=rows;
 return <section><h2>Inventory</h2>{notice&&<p role="status" ref={noticeTarget} tabIndex={-1}>{notice}</p>}<p>Search and tracking filters apply to the complete authorized inventory. Untracked items have no implied available stock count.</p><p className="admin-field-help">Variant state and catalogue availability are distinct from inventory tracking. Product active/archived state is not supplied by this inventory view.</p>
 <div className="admin-inventory-filters"><label>Search inventory<input type="search" maxLength={200} disabled={selected!==null} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Product name, SKU or options"/></label><label>Inventory tracking filter<select disabled={selected!==null} value={policy} onChange={event=>setPolicy(event.target.value)}><option value="">All tracking policies</option><option value="tracked">Tracked</option><option value="untracked">Untracked</option></select></label></div>
 <AdminCsvExport token={token} kind="inventory" query={query} policy={policy} disabled={loading||Boolean(error)||selected!==null}/><AdminReadState loading={loading} message={loading?(rows.length?'Refreshing inventory…':'Loading inventory…'):error} retry={pagination.refresh} retryLabel="Retry loading inventory"/>{!loading&&!error&&!visible.length&&<p>No matching variants.</p>}
 {!loading&&!error&&!selected&&<><InventoryWorklist rows={visible} select={row=>{setNotice('');setSelected(row);}}/><AdminPagination {...pagination}/></>}{!loading&&!error&&selected&&<><button type="button" data-admin-leave="true" onClick={()=>{if(window.confirm('Return to inventory? Unsaved changes will be discarded. Review any unconfirmed adjustment before retrying.'))setSelected(null);}}>Back to inventory</button><InventoryEditor key={selected.variant_id} row={selected} token={token} saved={()=>{setSelected(null);pagination.refresh();setNoticeSequence(value=>value+1);setNotice('Inventory change confirmed. Reloading authoritative balances.');}}/></>}
 </section>;
}
