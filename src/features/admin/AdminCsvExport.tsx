import type {RecordFilters} from './filters/recordFilters';
import {readExport,ExportReadError,exportFailureMessage} from './exportRead';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { checkAdmin } from './adminRepository';
import { exportCsv, type ExportKind } from './adminCsv';
function downloadCsv(csv:string,kind:ExportKind,filters?:RecordFilters):void {
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');
 const range=filters?.from&&filters.to?`-${filters.from.replace(/[^0-9TZ-]/g,'')}-to-${filters.to.replace(/[^0-9TZ-]/g,'')}-exclusive`:'';
 link.href=url;link.download=`lume-house-${kind}${range}.csv`;document.body.append(link);try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export function AdminCsvExport({token,kind,query,status='',policy='',disabled=false,filters}:{token:string;kind:ExportKind;query:string;status?:string;policy?:string;disabled?:boolean;filters?:RecordFilters}){
 const generation=useRef(0),running=useRef(false),activeRequest=useRef<AbortController|null>(null);const scope=JSON.stringify([token,kind,query,status,policy,disabled,filters]),latest=useRef(scope);const [state,setState]=useState({scope,busy:false,message:''});
 const invalidate=useCallback(()=>{generation.current++;running.current=false;activeRequest.current?.abort();},[]);useLayoutEffect(()=>{latest.current=scope;return invalidate;},[scope,invalidate]);const busy=state.scope===scope&&state.busy;
 async function run(){if(running.current||busy||disabled)return;running.current=true;const ticket=++generation.current,current=()=>ticket===generation.current&&latest.current===scope;setState({scope,busy:true,message:'Preparing complete filtered export…'});const controller=new AbortController();activeRequest.current=controller;const timeout=setTimeout(()=>controller.abort(),15000);
  try{const data=await readExport(getSupabaseClient(),token,filters?'admin_export_v2':'admin_export_v1',filters?{p_kind:kind,p_filters:filters}:{p_kind:kind,p_query:query,p_status:status,p_policy:policy},controller.signal);if(!current())return;const {csv,count}=exportCsv(data,kind);if(!await checkAdmin(getSupabaseClient(),token))throw new ExportReadError('denied');if(!current())return;if(count===0){setState({scope,busy:false,message:'No records match these filters. No CSV file was downloaded.'});return;}downloadCsv(csv,kind,filters);setState({scope,busy:false,message:`Complete export downloaded: ${count} records.`});}
  catch(cause){if(current())setState({scope,busy:false,message:exportFailureMessage(cause)});}finally{clearTimeout(timeout);if(activeRequest.current===controller)activeRequest.current=null;if(ticket===generation.current)running.current=false;}
 }
 return <div className="admin-export" aria-busy={busy}><button className="button secondary" type="button" aria-label={`Export filtered ${kind} CSV`} disabled={busy||disabled} onClick={()=>void run()}>{!busy&&<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>}{busy?'Preparing CSV…':'Export CSV'}</button>{busy&&<button type="button" className="text-link" onClick={()=>{invalidate();setState({scope,busy:false,message:'Export cancelled. No file was downloaded.'});}}>Cancel export</button>}{state.scope===scope&&state.message&&<p role="status">{state.message}</p>}</div>;
}
