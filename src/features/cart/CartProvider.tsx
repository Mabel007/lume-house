import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {cartReducer,cartLineKey,getCartLines,type CartItem,type CartAction} from './cart';
import {CartContext,type CartOutcome,type CartRecovery} from './CartContext';
import {useAuth} from '../auth/AuthContext';
import {useProducts} from '../products/ProductContext';
import {getSupabaseClient} from '../../lib/supabase/client';
import {visibleCart} from './cartRepository';
import {readGuestCart,resolveGuestCart,serializeGuestCart,stampGuestIntent} from './guestCart';
import {loadVariantCart,changeVariantCart,VariantCartError} from './variantCartRepository';
import {bagFailureNeedsRefresh,bagRecoveryNote} from './bagFeedback';
import type {Product} from '../products/products';
const storageKey='lume-guest-cart';
function readGuest(){try{return readGuestCart(sessionStorage.getItem(storageKey));}catch{return [];}}
function pendingGuest(items:CartItem[],products:Product[]){return items.filter(item=>!item.variantId||getCartLines([item],products).length===0);}
function withPending(items:CartItem[],guest:CartItem[],products:Product[]){return [...items,...pendingGuest(guest,products).filter(item=>!items.some(saved=>cartLineKey(saved)===cartLineKey(item)))];}
export function CartProvider({children}:{children:ReactNode}) {
  const auth=useAuth();const {state:catalog}=useProducts();const userId=auth.session?.user.id;const accessToken=auth.session?.access_token;
  const identity=useRef(userId);const epoch=useRef(0);
  const checkoutSequence=useRef(0);const checkout=useRef<{ticket:number;epoch:number}|null>(null);
  const [recoveryRecord,setRecoveryRecord]=useState<{owner:string|null;value:CartRecovery}|null>(null);const refreshing=useRef(false);
  // The same record in a ref, so an action that can start a request reads the
  // current recovery instead of the one of the last render.
  const recoveryRef=useRef<{owner:string|null;value:CartRecovery}|null>(null);
  // Trusted requests are answered in completion order, which is not the order
  // they were sent in. A change of this session that overlaps a read owns the
  // saved Bag, because such a read can answer with a snapshot taken before the
  // change. A change of an earlier session can never overlap a read of this
  // session, so the pending change carries the session it belongs to.
  const changeTickets=useRef(0);const pendingChange=useRef<{epoch:number;ticket:number}|null>(null);
  // The trusted requests that are running right now. The mutation lock below is
  // deliberately kept after a failed restore, so the ownership of a running
  // request is tracked separately: it decides what may start next, while the
  // lock decides what may change the saved Bag.
  const requestsInFlight=useRef(0);
  // A recovery belongs to the session that raised it: after a sign-in change the
  // previous session's request can no longer touch the new customer's Bag.
  const recovery=recoveryRecord&&recoveryRecord.owner===(userId??null)?recoveryRecord.value:null;
  useLayoutEffect(()=>{identity.current=userId;epoch.current+=1;checkout.current=null;},[userId]);
  const [guestItems,setGuestItems]=useState(readGuest);const guest=useRef<CartItem[]>(guestItems);const current=useRef<CartItem[]>([]);
  const [saved,setSaved]=useState<{userId:string;items:CartItem[]}|null>(null);
  const [status,setStatus]=useState('loading');const [error,setError]=useState<string|null>(null);const [revision,setRevision]=useState(0);const locked=useRef(false);
  function storeGuest(next:CartItem[]) {
    const items=stampGuestIntent(next,guest.current);guest.current=items;setGuestItems(items);
    try{sessionStorage.setItem(storageKey,serializeGuestCart(items));}catch{/* Memory intent remains usable when storage is blocked. */}
  }
  function applyRecovery(next:{owner:string|null;value:CartRecovery}|null){recoveryRef.current=next;setRecoveryRecord(next);}
  function patchRecovery(owner:string|null,patch:(value:CartRecovery)=>CartRecovery){
    const record=recoveryRef.current;
    if(!record||record.owner!==owner)return;
    const next={...record,value:patch(record.value)};
    recoveryRef.current=next;setRecoveryRecord(next);
  }
  useEffect(()=>{
    let active=true;current.current=[];locked.current=true;
    async function restore() {
      const generation=epoch.current;
      const isCurrent=()=>active&&identity.current===userId&&epoch.current===generation;
      // A read can answer with a snapshot taken before a change that overlaps
      // it, so the read only owns the saved Bag while no change of this session
      // overlaps it.
      const readTicket=changeTickets.current;
      const readOverlapped=pendingChange.current!==null&&pendingChange.current.epoch===generation;
      const superseded=()=>readOverlapped||changeTickets.current!==readTicket;
      let ownsRequest=false;
      try{
        setError(null);setStatus('loading');
        if(auth.loading)return;
        if(catalog.status!=='ready'){
          if(!userId){setStatus(catalog.status==='error'?'ready':'loading');locked.current=catalog.status!=='error';}
          else if(catalog.status==='error'){setStatus('error');setError('Load current products before restoring your Bag.');}
          return;
        }
        storeGuest(resolveGuestCart(guest.current,catalog.products));
        if(!userId||!accessToken){setSaved(null);setStatus('ready');locked.current=false;return;}
        ownsRequest=true;requestsInFlight.current+=1;
        let loaded=await loadVariantCart(getSupabaseClient(),accessToken);
        if(!isCurrent())return;
        for(const item of [...guest.current]) {
          if(!item.variantId||getCartLines([item],catalog.products).length===0)continue;
          if(!isCurrent())return;
          // The guest intent stays pending while a change owns the saved Bag.
          if(superseded())break;
          loaded=await changeVariantCart(getSupabaseClient(),accessToken,item.variantId,'merge',item.quantity,null,item.mergeId!);
          if(!isCurrent())return;
          storeGuest(guest.current.filter(value=>value.mergeId!==item.mergeId));
        }
        if(isCurrent()){
          if(superseded()){
            // The overlapping change owns the visible Bag. The read is dropped,
            // so it can never overwrite a newer confirmed change and it never
            // claims that the saved Bag was reconciled.
            if(pendingChange.current===null){locked.current=false;setStatus('ready');}
            return;
          }
          const items=withPending(loaded.items,guest.current,catalog.products);current.current=items;setSaved({userId,items});setStatus('ready');locked.current=false;
          if(pendingGuest(guest.current,catalog.products).length)setError('Some guest items are unavailable. Remove them from your Bag to continue; their browser intent has been retained.');
          // The trusted restore resolved, so a pending reconciliation is complete.
          patchRecovery(userId??null,value=>({...value,status:'completed'}));
        }
      }catch(reason){
        if(!isCurrent())return;
        if(superseded()){
          // The overlapping change owns the visible Bag, so a read that fails
          // late never claims that the saved Bag is broken.
          if(pendingChange.current===null){locked.current=false;setStatus('ready');}
          return;
        }
        setError(reason instanceof VariantCartError&&reason.code==='SCHEMA_NOT_READY'?reason.message:'Your saved Bag could not be restored or merged. Unsaved guest items are retained. Please retry.');setStatus('error');patchRecovery(userId??null,value=>({...value,status:'failed'}));
      }
      finally{
        if(ownsRequest)requestsInFlight.current-=1;
        if(isCurrent()){
          refreshing.current=false;
          // A reconciliation that never reached the server must not keep
          // claiming that it is refreshing the saved Bag.
          if(!ownsRequest)patchRecovery(userId??null,value=>value.status==='refreshing'?{...value,status:'required'}:value);
        }
      }
    }
    void restore();return()=>{active=false;};
  },[userId,accessToken,auth.loading,catalog,revision]);
  function dispatch(action:CartAction):Promise<CartOutcome> {
    if(auth.loading||locked.current)return Promise.resolve({kind:'superseded'});
    if(!userId){
      const next=cartReducer(guest.current,action);
      if(next===guest.current)return Promise.resolve({kind:'superseded'});
      storeGuest(next);
      return Promise.resolve({kind:'confirmed',items:guest.current});
    }
    if(action.type==='remove'&&pendingGuest(guest.current,catalog.status==='ready'?catalog.products:[]).some(item=>cartLineKey(item)===cartLineKey(action))){
      storeGuest(guest.current.filter(item=>cartLineKey(item)!==cartLineKey(action)));setRevision(value=>value+1);
      return Promise.resolve({kind:'confirmed',items:withPending(current.current,guest.current,catalog.status==='ready'?catalog.products:[])});
    }
    if(!action.variantId){
      if(action.type==='remove'){
        storeGuest(guest.current.filter(item=>cartLineKey(item)!==cartLineKey(action)));
        const items=current.current.filter(item=>cartLineKey(item)!==cartLineKey(action));current.current=items;setSaved({userId,items});setError(null);
        return Promise.resolve({kind:'confirmed',items:withPending(items,guest.current,catalog.status==='ready'?catalog.products:[])});
      }
      return Promise.resolve({kind:'superseded'});
    }
    if(!accessToken)return Promise.resolve({kind:'superseded'});
    const before=current.current;const next=cartReducer(before,action);if(next===before)return Promise.resolve({kind:'superseded'});
    const existing=before.find(item=>cartLineKey(item)===cartLineKey(action));const generation=epoch.current;
    // The change owns the saved Bag until it answers, so a read that overlaps
    // it can never overwrite the confirmed result.
    const ticket=++changeTickets.current;pendingChange.current={epoch:generation,ticket};
    locked.current=true;setStatus('saving');setError(null);
    requestsInFlight.current+=1;
    const mode=action.type==='add'?'add':action.type==='quantity'?'set':'remove';
    const quantity=action.type==='remove'?null:action.type==='add'?action.quantity??1:action.quantity;
    return changeVariantCart(getSupabaseClient(),accessToken,action.variantId,mode,quantity,mode==='add'?null:existing?.quantity??0,crypto.randomUUID()).then((loaded):CartOutcome=>{
      if(identity.current===userId&&epoch.current===generation&&changeTickets.current===ticket){
        const items=withPending(loaded.items,guest.current,catalog.status==='ready'?catalog.products:[]);
        current.current=items;setSaved({userId,items});
        // A confirmed change supersedes any pending reconciliation request.
        applyRecovery(null);
        return {kind:'confirmed',items};
      }
      return {kind:'superseded'};
    }).catch((reason):CartOutcome=>{
      if(!(identity.current===userId&&epoch.current===generation&&changeTickets.current===ticket))return {kind:'superseded'};
      const failure=reason instanceof VariantCartError?reason.kind:'uncertain';
      const message=reason instanceof VariantCartError?reason.message:'Your Bag change could not be confirmed. Refresh it before trying again.';
      // Quantity changes keep the Bag-level error and retry action. Add/remove
      // action callers own their single action-specific notification.
      if(action.type==='quantity')setError(message);
      else if(bagFailureNeedsRefresh(failure))applyRecovery({owner:userId??null,value:{status:'required',message:bagRecoveryNote(failure)}});
      return {kind:'rejected',message,failure};
    }).finally(()=>{
      requestsInFlight.current-=1;
      if(pendingChange.current&&pendingChange.current.ticket===ticket)pendingChange.current=null;
      if(identity.current===userId&&epoch.current===generation&&changeTickets.current===ticket){locked.current=false;setStatus('ready');}
    });
  }
  /**
   * Reconciles the saved Bag by re-reading the trusted server state. It never
   * repeats the change that could not be confirmed, never mints a replacement
   * operation id for it, and never runs beside another trusted request.
   */
  function refreshSavedCart(){
    if(!userId||!accessToken)return;
    // The reconciliation is refused while a trusted request owns the saved Bag,
    // while another reconciliation runs and while a checkout is open. The
    // mutation lock is deliberately kept after a failed restore, so it is not
    // consulted here: a settled reconciliation must always be retryable.
    if(refreshing.current||requestsInFlight.current>0||checkout.current)return;
    if(catalog.status!=='ready')return;
    const record=recoveryRef.current;
    if(!record||record.owner!==(userId??null))return;
    refreshing.current=true;locked.current=true;
    patchRecovery(userId??null,value=>({...value,status:'refreshing'}));
    setRevision(value=>value+1);
  }
  const items=visibleCart(auth.loading,userId,saved,guestItems);
  function beginCheckout(){if(!userId||locked.current||status!=='ready'||items.some(item=>!item.variantId))return null;const ticket=++checkoutSequence.current;checkout.current={ticket,epoch:epoch.current};locked.current=true;setStatus('checking-out');return ticket;}
  function finishCheckout(placed:boolean,ticket:number|null|undefined){if(!userId||identity.current!==userId||!checkout.current||checkout.current.ticket!==ticket||checkout.current.epoch!==epoch.current)return;checkout.current=null;if(placed){current.current=[];setSaved({userId,items:[]});}locked.current=false;setStatus('ready');}
  return <CartContext.Provider value={{items,dispatch,status,error,retry:()=>setRevision(value=>value+1),recovery,refreshSavedCart,beginCheckout,finishCheckout}}>{children}</CartContext.Provider>;
}
