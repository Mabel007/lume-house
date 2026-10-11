import {useEffect,useRef,useState,type FormEvent} from 'react';
import {getSupabaseClient} from '../../lib/supabase/client';
import {AdminForm} from './AdminForm';
import {adminErrorKind,adminReadFailure,adminRpc,isAdminDenied} from './adminRepository';
import {confirmFulfilment,fulfilmentInput,parseFulfilment,type FulfilmentRead} from './fulfilment';
import type {AdminErrorKind} from './adminFormBehavior';

type Props={orderId:string;token:string;blocked?:boolean;accessChanged:(denied:boolean)=>void};
// The key discards private drafts/pending responses immediately on account/order changes.
export function ManualFulfilment(props:Props){return <FulfilmentEditor key={`${props.orderId}:${props.token}`} {...props}/>;}
function FulfilmentEditor({orderId,token,blocked=false,accessChanged}:Props){
 const [read,setRead]=useState<FulfilmentRead|null>(null);const [readError,setReadError]=useState('');const [loading,setLoading]=useState(true);const [revision,setRevision]=useState(0);
 const [carrier,setCarrier]=useState('');const [tracking,setTracking]=useState('');const [reason,setReason]=useState('');const initialized=useRef(false);const [formReady,setFormReady]=useState(false);const [hasPending,setHasPending]=useState(false);
 const [error,setError]=useState('');const [kind,setKind]=useState<AdminErrorKind>('validation');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
 const [denied,setDenied]=useState(false);const submitting=useRef(false);const alive=useRef(true);const pending=useRef<{signature:string;id:string;expected:number}|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let active=true;
 adminRpc(getSupabaseClient(),token,'admin_get_fulfilment_v1',{p_order_id:orderId}).then(value=>{
  const loaded=parseFulfilment(value,orderId);if(!active)return;
  setRead(loaded);setReadError('');setDenied(false);accessChanged(false);
  if(!initialized.current){setCarrier(loaded.current.carrier_label??'');setTracking(loaded.current.tracking_reference??'');initialized.current=true;setFormReady(true);}
 }).catch(cause=>{if(!active)return;setRead(null);setReadError(adminReadFailure(cause,'Manual delivery details'));if(isAdminDenied(cause)){setDenied(true);accessChanged(true);}}).finally(()=>{if(active)setLoading(false);});
 return()=>{active=false;};
 },[orderId,token,revision,accessChanged]);
 function reload(){if(submitting.current)return;setLoading(true);setRead(null);setReadError('');setRevision(value=>value+1);}
 function discard(form:HTMLFormElement|null){if(pending.current||!read||busy)return;setCarrier(read.current.carrier_label??'');setTracking(read.current.tracking_reference??'');setReason('');setError('');setNotice('Unsaved delivery edits cancelled.');if(form)form.dataset.adminDirty='false';}
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(submitting.current||blocked||denied||loading||!read||kind==='stale')return;
 let input:ReturnType<typeof fulfilmentInput>;try{input=fulfilmentInput(carrier,tracking,reason);}catch(cause){setKind('validation');setError(cause instanceof Error?cause.message:'Invalid delivery fields.');return;}
 const expected=pending.current?.expected??read.current.version;const signature=JSON.stringify([orderId,expected,input]);
 if(pending.current&&signature!==pending.current.signature){setKind('uncertain');setError('Retry the original fields and reason before making another edit. An earlier save is unconfirmed.');return;}
 pending.current??={signature,id:crypto.randomUUID(),expected};setHasPending(true);const form=event.currentTarget;submitting.current=true;setBusy(true);setError('');setNotice('');
 try{
  confirmFulfilment(await adminRpc(getSupabaseClient(),token,'admin_save_fulfilment_v1',{p_order_id:orderId,p_expected_version:expected,p_carrier_label:input.carrier_label,p_tracking_reference:input.tracking_reference,p_reason:input.reason,p_operation_id:pending.current.id}),orderId,expected,input);
  if(!alive.current)return;pending.current=null;setHasPending(false);form.dataset.adminDirty='false';setReason('');setNotice('Manual delivery details saved. Operational and payment statuses are unchanged.');setKind('validation');setRead(null);setLoading(true);setRevision(value=>value+1);
 }catch(cause){if(!alive.current)return;const next=adminErrorKind(cause,true);setKind(next);setError(cause instanceof Error?cause.message:'Delivery save could not be confirmed.');if(next==='stale'){pending.current=null;setHasPending(false);setRead(null);}if(isAdminDenied(cause)){setDenied(true);setRead(null);accessChanged(true);}}
 finally{submitting.current=false;if(alive.current)setBusy(false);}
 }
 const hidden=blocked||denied;
 return <section className="admin-form" aria-label="Manual delivery details">
  <h3>Manual delivery details</h3><p>Admin-only courier notes and reference. These do not book delivery, verify tracking, confirm payment or change order status.</p>
  {loading&&<p role="status">Loading manual delivery details…</p>}
  {readError&&<p role="alert">{readError}</p>}
  {notice&&!hidden&&<p role="status">{notice}</p>}
  <button type="button" disabled={busy||loading} onClick={()=>{if(kind==='stale')setKind('validation');reload();}}>Reload delivery details</button>
  {formReady&&<AdminForm hidden={!read||loading||hidden} blocked={!read||loading||hidden} busy={busy} error={hidden?'':error} errorKind={kind} uncertain={hasPending} onSubmit={save}>
   <label>Courier / carrier label (optional)<input name="carrier_label" autoComplete="off" maxLength={100} value={carrier} onChange={event=>setCarrier(event.target.value)}/></label>
   <label>Tracking reference (optional)<input name="tracking_reference" autoComplete="off" maxLength={100} value={tracking} onChange={event=>setTracking(event.target.value)}/></label>
   <label>Reason for delivery details change<textarea name="fulfilment_reason" required maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   <button className="button" disabled={busy}>Save delivery details</button><button type="button" disabled={busy||hasPending} onClick={event=>discard(event.currentTarget.closest('form'))}>Cancel delivery edits</button>
  </AdminForm>}
  {error&&(!read||hidden)&&<p role="alert">{error} Your draft is retained. Reload before saving again.</p>}
  {read&&!hidden&&<><h4>Recent delivery changes</h4>{read.history.length?<ol>{read.history.map(item=><li key={item.operation_id}><RecordTime value={item.created_at}/> — revision {item.version}: {item.carrier_label??'No carrier'} / {item.tracking_reference??'No reference'}. {item.reason}</li>)}</ol>:<p>No manual delivery changes recorded.</p>}<p>Latest 50 changes shown. The full audit is retained server-side.</p></>}
 </section>;
}
import {RecordTime} from '../../components/RecordTime';
