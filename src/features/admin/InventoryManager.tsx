import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { adminRpc } from './adminRepository';
export type InventoryRow={variant_id:string;product_name:string;sku:string;inventory_policy:'tracked'|'untracked';updated_at:string;on_hand:number|null;allocated:number|null;available:boolean};
type HistoryRow={id:string;event:string;reason:string;created_at:string;on_hand_delta:number;allocated_delta:number};
export function InventoryEditor({row,token,saved}:{row:InventoryRow;token:string;saved:()=>void}){
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [history,setHistory]=useState<HistoryRow[]>([]);
  const pending=useRef<{signature:string;id:string}|null>(null);
  useEffect(()=>{let active=true;adminRpc(getSupabaseClient(),token,'admin_inventory_history',{p_variant_id:row.variant_id}).then(data=>{if(!Array.isArray(data))throw new Error('Invalid inventory history.');if(active)setHistory(data as HistoryRow[]);}).catch(cause=>{if(active)setError(cause.message);});return()=>{active=false;};},[token,row.variant_id]);
  async function adjust(e:FormEvent<HTMLFormElement>){e.preventDefault();const data=new FormData(e.currentTarget);const delta=Number(data.get('delta'));const reason=String(data.get('reason')).trim();const signature=JSON.stringify([row.variant_id,delta,reason]);setError('');
    if(pending.current&&pending.current.signature!==signature){setError('Retry the same adjustment or reload and review the ledger before changing it.');return;}
    pending.current??={signature,id:crypto.randomUUID()};setBusy(true);
    try{await adminRpc(getSupabaseClient(),token,'admin_adjust_inventory',{p_variant_id:row.variant_id,p_delta:delta,p_reason:reason,p_operation_id:pending.current.id});pending.current=null;saved();}
    catch(cause){setError(cause instanceof Error?cause.message:'Adjustment failed.');}finally{setBusy(false);}
  }
  async function policy(e:FormEvent<HTMLFormElement>){e.preventDefault();if(pending.current){setError('Resolve or review the pending adjustment before changing policy.');return;}const data=new FormData(e.currentTarget);setBusy(true);setError('');
    try{await adminRpc(getSupabaseClient(),token,'admin_set_inventory_policy',{p_variant_id:row.variant_id,p_policy:data.get('policy'),p_expected_updated_at:row.updated_at});saved();}catch(cause){setError(cause instanceof Error?cause.message:'Policy failed.');}finally{setBusy(false);}
  }
  return <section className="admin-form"><h3>{row.product_name} — {row.sku}</h3><p>On hand: {row.on_hand??'Not configured'} · Allocated: {row.allocated??'Not configured'}</p>
    <form onSubmit={adjust}><h4>Stock adjustment</h4><label>Quantity change (integer)<input name="delta" type="number" step="1" required/></label><label>Reason<textarea name="reason" required maxLength={500}/></label><p>Enter actual stock changes only. Zero explicitly prepares a known empty balance. The Bag does not reserve stock.</p><button className="button" disabled={busy}>Apply adjustment</button></form>
    <form onSubmit={policy}><h4>Inventory policy</h4><label>Tracking<select name="policy" defaultValue={row.inventory_policy}><option value="untracked">Untracked</option><option value="tracked">Tracked</option></select></label><p>Prepare actual stock before enabling tracking. Allocated stock must stay tracked.</p><button className="button" disabled={busy}>Save inventory policy</button></form>
    {error&&<p role="alert">{error}</p>}<h4>Recent adjustment history</h4>{!history.length&&<p>No history loaded.</p>}<ul className="admin-list">{history.map(h=><li key={h.id}>{h.created_at}: {h.event}; on-hand change {h.on_hand_delta}, allocation change {h.allocated_delta}. {h.reason}</li>)}</ul>
  </section>;
}
export function InventoryManager({token}:{token:string}){
  const [rows,setRows]=useState<InventoryRow[]>([]);const [selected,setSelected]=useState<InventoryRow|null>(null);const [revision,setRevision]=useState(0);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;adminRpc(getSupabaseClient(),token,'admin_list_inventory').then(data=>{if(!Array.isArray(data))throw new Error('Invalid inventory response.');if(active){setRows(data as InventoryRow[]);setLoading(false);}}).catch(cause=>{if(active){setError(cause.message);setLoading(false);}});return()=>{active=false;};},[token,revision]);
  return <section><h2>Inventory</h2><p>Up to 500 variants. Untracked items have no implied stock count.</p>{loading&&<p role="status">Loading inventory…</p>}{error&&<p role="alert">{error}</p>}{!loading&&!rows.length&&!error&&<p>No variants found.</p>}
    <ul className="admin-list">{rows.map(r=><li key={r.variant_id}><button onClick={()=>setSelected(r)}>{r.product_name} — {r.sku} — {r.inventory_policy} — {r.available?'Available':'Unavailable'}</button></li>)}</ul>
    {selected&&<InventoryEditor key={selected.variant_id} row={selected} token={token} saved={()=>{setSelected(null);setRevision(r=>r+1);}}/>}
  </section>;
}
