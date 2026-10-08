import {AdminReadState} from './AdminReadState';
import {parseAdminRows} from './adminValidation';
import { AdminForm } from './AdminForm';
import { useAdminReturnFocus } from './adminFormBehavior';
import { useEffect, useRef, useState, useCallback, type ReactNode, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../auth/AuthContext';
import { adminRpc, adminReadFailure, isAdminDenied } from './adminRepository';
import { canRevokeMembership, membershipFailure, parseMembership, parseMembershipEvent, revokeMembership, type Membership, type MembershipEvent } from './membershipPresentation';
type MembershipState={status:'loading'|'ready'|'error';members:Membership[];history:MembershipEvent[];message?:string;uncertain?:boolean};
function MembershipDate({value}:{value:string|null}){return value?<time dateTime={value}>{new Date(value).toLocaleString()}</time>:<span>Not recorded — historic provisioning date unknown</span>;}
export function MembershipRows({members,currentUserId,busy,revoke,reasons={},reasonChanged,validation}:{members:Membership[];currentUserId:string|null;busy:boolean;revoke:(event:FormEvent<HTMLFormElement>,member:Membership)=>void;reasons?:Record<string,string>;reasonChanged?:(id:string,value:string)=>void;validation?:{id:string;message:string}|null}){
 return members.length?<ul className="admin-membership-list">{members.map(member=>{
 const current=member.user_id===currentUserId;const help=`membership-help-${member.user_id}`;
 return <li key={member.user_id}><header className="admin-membership-heading"><div><h3>Account ID</h3><p className="admin-membership-id">{member.user_id}</p>{current&&<p className="admin-current-account">Your current account</p>}</div><span className="status-pill">{member.active?'Active':'Revoked'}</span></header>
 <dl className="admin-membership-dates"><div><dt>Provisioned</dt><dd><MembershipDate value={member.created_at}/></dd></div><div><dt>Last updated</dt><dd><MembershipDate value={member.updated_at}/></dd></div></dl>
 {member.active?<AdminForm className="admin-form" onSubmit={event=>revoke(event,member)} busy={busy} error={validation?.id===member.user_id?validation.message:''} errorKind="validation"><fieldset disabled={busy||!canRevokeMembership(member,currentUserId)}><label>Revocation reason<textarea name="reason" required maxLength={500} aria-describedby={help} value={reasons[member.user_id]??''} onChange={event=>reasonChanged?.(member.user_id,event.target.value)}/></label><p id={help} className="admin-field-help">{current?'Self-revocation is disabled. You cannot revoke your own business access.':!currentUserId?'Current Auth identity is unavailable; revocation is disabled.':'Required reason is recorded in membership history. Revocation removes business access; it does not delete the Auth account.'}</p><button className="button" disabled={busy||!canRevokeMembership(member,currentUserId)}>Revoke membership</button></fieldset></AdminForm>:<p className="admin-field-help">Business access is revoked. Reactivation is a privileged service-only operation.</p>}
 </li>;
 })}</ul>:<p>No memberships found.</p>;
}
export function MembershipHistory({history,currentUserId}:{history:MembershipEvent[];currentUserId:string|null}){
 return <section><h3>Membership history</h3><p className="admin-field-help">Most recent 100 recorded changes, newest first. This is not the complete history. Older provisioning may predate this history.</p>{history.length?<ol className="admin-membership-history">{history.map(event=><li key={event.id}><strong>{event.active?'Business access enabled':'Business access revoked'}</strong><MembershipDate value={event.created_at}/><p>Account ID: <span className="admin-membership-id">{event.user_id}</span>{event.user_id===currentUserId?' (your current account)':''}</p><p>Reason: {event.reason}</p><p className="admin-field-help">Actor account ID: {event.actor_user_id??'Not recorded'}{event.actor_user_id!==null&&event.actor_user_id===currentUserId?' (your current account)':''}</p></li>)}</ol>:<p>No recorded membership changes. Historic provisioning may not have an audit entry.</p>}</section>;
}
export function MembershipContent({state,currentUserId,busy,revoke,reload,reasons,reasonChanged,validation,historyPanel}:{state:MembershipState;currentUserId:string|null;busy:boolean;revoke:(event:FormEvent<HTMLFormElement>,member:Membership)=>void;reload:()=>void;reasons?:Record<string,string>;reasonChanged?:(id:string,value:string)=>void;validation?:{id:string;message:string}|null;historyPanel?:ReactNode}){
 const errorTarget=useRef<HTMLParagraphElement>(null);useAdminReturnFocus(state.status==='error'?state.message??'Membership error':'',errorTarget);
 if(state.status==='loading')return <p role="status">Loading memberships and history…</p>;
 if(state.status==='error')return <p data-admin-uncertain={state.uncertain} ref={errorTarget} tabIndex={-1}>{state.message} <button type="button" disabled={busy} onClick={reload}>Reload memberships</button></p>;
 return <><MembershipRows members={state.members} currentUserId={currentUserId} busy={busy} revoke={revoke} reasons={reasons} reasonChanged={reasonChanged} validation={validation}/>{historyPanel??<MembershipHistory history={state.history} currentUserId={currentUserId}/>}</>;
}
export function MembershipManager({token}:{token:string}){
 const {session}=useAuth();const currentUserId=session?.user.id??null;
 const [busy,setBusy]=useState(false);const submitting=useRef(false);const [revision,setRevision]=useState(0);const generation=useRef(0);
 const [notice,setNotice]=useState('');const [validation,setValidation]=useState<{id:string;message:string}|null>(null);const [reasons,setReasons]=useState<Record<string,string>>({});const [pendingReview,setPendingReview]=useState(false);
 const noticeTarget=useRef<HTMLParagraphElement>(null);useAdminReturnFocus(notice,noticeTarget);
 const [result,setResult]=useState<{token:string;revision:number;state:MembershipState}>({token,revision,state:{status:'loading',members:[],history:[]}});
 useEffect(()=>{let live=true;const request=generation.current;
 void adminRpc(getSupabaseClient(),token,'admin_list_memberships').then(rows=>{
 const members=parseAdminRows(rows,parseMembership,row=>row.user_id);
 if(live&&request===generation.current)setResult({token,revision,state:{status:'ready',members,history:[]}});
 }).catch(cause=>{if(live&&request===generation.current)setResult({token,revision,state:{status:'error',members:[],history:[],message:adminReadFailure(cause,'Memberships')}});});
 return()=>{live=false;};},[token,revision]);
 const historyDenied=useCallback((cause:unknown)=>{generation.current+=1;setResult(current=>({...current,state:{status:'error',members:[],history:[],message:adminReadFailure(cause,'Membership history')}}));},[]);
 const state:MembershipState=result.token===token&&result.revision===revision?result.state:{status:'loading',members:[],history:[]};
 function reload(){generation.current+=1;setValidation(null);setRevision(value=>value+1);}
 async function revoke(event:FormEvent<HTMLFormElement>,member:Membership){
 event.preventDefault();if(submitting.current||!canRevokeMembership(member,currentUserId)||state.status!=='ready')return;
 const reason=String(new FormData(event.currentTarget).get('reason')??'').trim();if(!reason||reason.length>500){setValidation({id:member.user_id,message:'Enter a revocation reason of 1 to 500 characters.'});return;}
 if(!window.confirm('Revoke this membership? Trusted business access will stop. You cannot revoke yourself.'))return;
 submitting.current=true;setBusy(true);setValidation(null);setNotice('');
 try{await revokeMembership(getSupabaseClient(),token,member,currentUserId,reason);setPendingReview(false);setReasons(current=>{const next={...current};delete next[member.user_id];return next;});setNotice('Membership revocation confirmed. Reloading current access records.');reload();}
 catch(cause){setPendingReview(true);generation.current+=1;setResult({token,revision,state:{status:'error',members:[],history:[],message:membershipFailure(cause,true),uncertain:true}});}
 finally{submitting.current=false;setBusy(false);}
 }
 return <section data-admin-uncertain={pendingReview}><h2>Admin memberships</h2><p>Every active business admin currently has the same administration permissions: catalogue, inventory, orders and membership revocation. There is no separate owner or staff role here.</p><p className="admin-field-help">Provisioning and first-admin recovery remain privileged service-only operations. Customer emails and Auth credentials are not exposed here. Self-revocation is disabled.</p>
 {notice&&<p role="status" className="admin-save-notice" ref={noticeTarget} tabIndex={-1}>{notice}</p>}
 {pendingReview&&state.status==='ready'&&<p>The previous revocation was not confirmed. Review membership state and history before retrying.</p>}
 <MembershipContent state={state} currentUserId={currentUserId} busy={busy} revoke={(event,member)=>void revoke(event,member)} reload={reload} reasons={reasons} reasonChanged={(id,value)=>setReasons(current=>({...current,[id]:value}))} validation={validation} historyPanel={<AdminMembershipHistory token={token} currentUserId={currentUserId} denied={historyDenied}/>}/>
 </section>;
}

function AdminMembershipHistory({token,currentUserId,denied}:{token:string;currentUserId:string|null;denied:(cause:unknown)=>void}) {
 const [state,setState]=useState<{status:'loading'|'ready'|'error';rows:MembershipEvent[];message?:string}>({status:'loading',rows:[]});const [revision,setRevision]=useState(0);
 useEffect(()=>{let live=true;void adminRpc(getSupabaseClient(),token,'admin_membership_history').then(data=>parseAdminRows(data,parseMembershipEvent,row=>row.id,100)).then(rows=>{if(live)setState({status:'ready',rows});}).catch(cause=>{if(live){if(isAdminDenied(cause))denied(cause);setState({status:'error',rows:[],message:adminReadFailure(cause,'Membership history')});}});return()=>{live=false;};},[token,revision,denied]);
 if(state.status==='ready')return <MembershipHistory history={state.rows} currentUserId={currentUserId}/>;
 return <section><h3>Membership history</h3><AdminReadState loading={state.status==='loading'} message={state.status==='loading'?'Loading membership history…':state.message} retry={()=>{setState({status:'loading',rows:[]});setRevision(value=>value+1);}} retryLabel="Retry membership history"/></section>;
}
