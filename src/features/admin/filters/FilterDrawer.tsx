import { useEffect, useId, useRef, type ReactNode } from 'react';
import './filters.css';
export function FilterDrawer({title,children,onClose,onApply,onReset}:{title:string;children:ReactNode;onClose:()=>void;onApply:()=>void;onReset:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null), close=useRef<HTMLButtonElement>(null),titleId=useId();
 useEffect(()=>{const node=dialog.current,opener=document.activeElement;if(node?.showModal)node.showModal();else node?.setAttribute('open','');close.current?.focus();return()=>{if(node?.open&&node.close)node.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();};},[]);
 return <dialog ref={dialog} className="admin-filter-drawer" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}}><form onSubmit={e=>{e.preventDefault();onApply();}}><header><div><h2 id={titleId}>{title}</h2><p>Changes take effect when you apply them.</p></div><button ref={close} type="button" className="button secondary" onClick={onClose}>Close filters</button></header><div className="admin-filter-body">{children}</div><footer><button type="button" className="button secondary" onClick={onReset}>Reset draft</button><button className="button">Apply Filters</button></footer></form></dialog>;
}
