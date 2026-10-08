import { useEffect, type RefObject } from 'react';
export function describeAdminError(existing:string|null,id:string):string{return [...new Set([...(existing??'').split(/\s+/).filter(Boolean),id])].join(' ');}
export function adminLeaveMessage(uncertain:boolean):string{return uncertain?'Leave this workspace? An unconfirmed mutation may already have succeeded. Review the saved record and history before starting a new operation. Unsaved drafts will be discarded.':'Leave this workspace? Unsaved drafts will be discarded.';}
export function useAdminDraftNavigation(root:RefObject<HTMLElement|null>, routerBlocking=false){
 useEffect(()=>{
 function draftState(){const forms=Array.from(root.current?.querySelectorAll<HTMLFormElement>('form[data-admin-mutation]')??[]);const uncertain=Boolean(root.current?.querySelector('[data-admin-uncertain="true"]'));return {dirty:uncertain||forms.some(form=>form.dataset.adminDirty==='true'||form.dataset.adminUncertain==='true'),uncertain,busy:forms.some(form=>form.getAttribute('aria-busy')==='true')};}
 function leave(event:MouseEvent){if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!(event.target instanceof Element))return;const action=event.target.closest<HTMLAnchorElement>('a[href], [data-admin-leave]');if(!action||!root.current?.contains(action))return;
 if(action instanceof HTMLAnchorElement){if(routerBlocking&&new URL(action.href).origin===location.origin)return;if(action.target&&action.target!=='_self'||action.hasAttribute('download'))return;const url=new URL(action.href);if(url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search)return;}
 const state=draftState();if(!state.dirty&&!state.busy)return;
 if(state.busy){event.preventDefault();event.stopImmediatePropagation();window.alert('A save is in progress. Wait for its result before leaving.');return;}
 if(!window.confirm(adminLeaveMessage(state.uncertain))){event.preventDefault();event.stopImmediatePropagation();}
 }
 function unload(event:BeforeUnloadEvent){const state=draftState();if(state.dirty||state.busy){event.preventDefault();event.returnValue='';}}
 document.addEventListener('click',leave,true);window.addEventListener('beforeunload',unload);
 return()=>{document.removeEventListener('click',leave,true);window.removeEventListener('beforeunload',unload);};
 },[root,routerBlocking]);
}
export type AdminErrorKind='validation'|'stale'|'denied'|'uncertain';
export function useAdminReturnFocus(message:string, target:RefObject<HTMLElement|null>, occurrence:unknown=message){useEffect(()=>{if(message)target.current?.focus();},[message,target,occurrence]);}


export function shouldBlockAdminNavigation(current:{pathname:string;search:string},next:{pathname:string;search:string},dirty:boolean):boolean{return dirty&&(current.pathname!==next.pathname||current.search!==next.search);}
