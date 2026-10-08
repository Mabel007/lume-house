import { describeAdminError, adminLeaveMessage, shouldBlockAdminNavigation, type AdminErrorKind } from './adminFormBehavior';
import { useBlocker } from 'react-router-dom';
import { useEffect, useId, useRef, type FormHTMLAttributes, type RefObject } from 'react';

export function AdminForm({error='', errorKind='uncertain', uncertain=false, blocked=false, busy=false, children, ...props}: FormHTMLAttributes<HTMLFormElement> & {error?:string;errorKind?:AdminErrorKind;uncertain?:boolean;blocked?:boolean;busy?:boolean}) {
 const form=useRef<HTMLFormElement>(null);
 const summary=useRef<HTMLParagraphElement>(null);
 const errorId=useId();
 const invalid=useRef(new Map<HTMLElement,string|null>());
 useEffect(()=>{
  if(!error || !form.current)return;
  const node=form.current;
  const original=new Map<Element,string|null>();
  function restore(control:Element,previous:string|null) {
   const remaining=(control.getAttribute('aria-describedby')??'').split(/\s+/).filter(value=>value&&value!==errorId).join(' ');
   if(remaining)control.setAttribute('aria-describedby',remaining);
   else if(previous==='')control.setAttribute('aria-describedby','');
   else control.removeAttribute('aria-describedby');
  }
  function associate() {
   for(const [control,previous] of original)if(!node.contains(control)){restore(control,previous);original.delete(control);}
   for(const control of node.querySelectorAll('input:not([type="hidden"]),textarea,select')) {
    if(!original.has(control))original.set(control,control.getAttribute('aria-describedby'));
    const description=describeAdminError(control.getAttribute('aria-describedby'),errorId);
    if(control.getAttribute('aria-describedby')!==description)control.setAttribute('aria-describedby',description);
   }
  }
  associate();
  const observer=new MutationObserver(associate);
  observer.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-describedby']});
  return()=>{observer.disconnect();for(const [control,previous] of original)restore(control,previous);};
 },[error,errorId]);
 useEffect(()=>{if(error)summary.current?.focus();},[error]);
 useEffect(()=>{const original=invalid.current;return()=>{for(const [control,previous] of original){if(previous===null)control.removeAttribute('aria-invalid');else control.setAttribute('aria-invalid',previous);}};},[]);
 return <form {...props} ref={form} data-admin-mutation="true" data-admin-uncertain={uncertain||(Boolean(error)&&errorKind==='uncertain')} aria-busy={busy} aria-describedby={error?errorId:undefined}
  onClick={event=>{if(event.target instanceof Element&&event.target.closest('[data-admin-draft-change]'))event.currentTarget.dataset.adminDirty='true';props.onClick?.(event);}}
  onChange={event=>{event.currentTarget.dataset.adminDirty='true';const control=event.target;if(control instanceof HTMLInputElement||control instanceof HTMLTextAreaElement||control instanceof HTMLSelectElement){if(invalid.current.has(control)){const previous=invalid.current.get(control);if(previous==null)control.removeAttribute('aria-invalid');else control.setAttribute('aria-invalid',previous);invalid.current.delete(control);}}props.onChange?.(event);}}
  onInvalid={event=>{const control=event.target;if(control instanceof HTMLElement){if(!invalid.current.has(control))invalid.current.set(control,control.getAttribute('aria-invalid'));control.setAttribute('aria-invalid','true');}props.onInvalid?.(event);}}>
 <fieldset className="admin-form-controls" disabled={busy||blocked}>{children}</fieldset>
 {uncertain&&!error&&<p>An earlier save was not confirmed. Review the saved record before retrying or leaving this draft.</p>}
 {busy&&<p role="status">Saving changes… Please wait before leaving this form.</p>}
 {error&&<p id={errorId} ref={summary} tabIndex={-1} className="admin-form-error" data-error-kind={errorKind}>{error} Your input is retained.{errorKind==='uncertain'&&' Review the record before retrying an unconfirmed operation.'}</p>}
 </form>;
}
export function AdminRouteDraftBlocker({root}:{root:RefObject<HTMLElement|null>}){
 const seen=useRef<string|null>(null);
 const blocker=useBlocker(({currentLocation,nextLocation})=>{
 const dirty=Boolean(root.current?.querySelector('[data-admin-uncertain="true"]'))||Array.from(root.current?.querySelectorAll<HTMLFormElement>('form[data-admin-mutation]')??[]).some(form=>form.dataset.adminDirty==='true'||form.dataset.adminUncertain==='true'||form.getAttribute('aria-busy')==='true');
 return shouldBlockAdminNavigation(currentLocation,nextLocation,dirty);
 });
 useEffect(()=>{
 if(blocker.state!=='blocked'){seen.current=null;return;}
 if(seen.current===blocker.location.key)return;seen.current=blocker.location.key;
 const forms=Array.from(root.current?.querySelectorAll<HTMLFormElement>('form[data-admin-mutation]')??[]);
 if(forms.some(form=>form.getAttribute('aria-busy')==='true')){window.alert('A save is in progress. Wait for its result before leaving.');blocker.reset();return;}
 if(window.confirm(adminLeaveMessage(Boolean(root.current?.querySelector('[data-admin-uncertain="true"]')))))blocker.proceed();else blocker.reset();
 },[blocker,root]);
 return null;
}
