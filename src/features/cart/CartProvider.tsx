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
  useEffect(()=>{
    let active=true;current.current=[];locked.current=true;
    async function restore() {
      setError(null);setStatus('loading');
      if(auth.loading)return;
      if(catalog.status!=='ready'){
        if(!userId){setStatus(catalog.status==='error'?'ready':'loading');locked.current=catalog.status!=='error';}
        else if(catalog.status==='error'){setStatus('error');setError('Load current products before restoring your Bag.');}
        return;
      }
      storeGuest(resolveGuestCart(guest.current,catalog.products));
      if(!userId||!accessToken){setSaved(null);setStatus('ready');locked.current=false;return;}
      const generation=epoch.current;
      const isCurrent=()=>active&&identity.current===userId&&epoch.current===generation;
      try{
        let loaded=await loadVariantCart(getSupabaseClient(),accessToken);
        if(!isCurrent())return;
        for(const item of [...guest.current]) {
          if(!item.variantId||getCartLines([item],catalog.products).length===0)continue;
          if(!isCurrent())return;
          loaded=await changeVariantCart(getSupabaseClient(),accessToken,item.variantId,'merge',item.quantity,null,item.mergeId!);
          if(!isCurrent())return;
          storeGuest(guest.current.filter(value=>value.mergeId!==item.mergeId));
        }
        if(isCurrent()){
          const items=withPending(loaded.items,guest.current,catalog.products);current.current=items;setSaved({userId,items});setStatus('ready');locked.current=false;
          if(pendingGuest(guest.current,catalog.products).length)setError('Some guest items are unavailable. Remove them from your Bag to continue; their browser intent has been retained.');
          // The trusted restore resolved, so a pending reconciliation is complete.
          setRecoveryRecord(current=>current&&current.owner===(userId??null)?{...current,value:{...current.value,status:'completed'}}:current);
        }
      }catch(reason){if(isCurrent()){setError(reason instanceof VariantCartError&&reason.code==='SCHEMA_NOT_READY'?reason.message:'Your saved Bag could not be restored or merged. Unsaved guest items are retained. Please retry.');setStatus('error');setRecoveryRecord(current=>current&&current.owner===(userId??null)?{...current,value:{...current.value,status:'failed'}}:current);}}
      finally{if(isCurrent())refreshing.current=false;}
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
    locked.current=true;setStatus('saving');setError(null);
    const mode=action.type==='add'?'add':action.type==='quantity'?'set':'remove';
    const quantity=action.type==='remove'?null:action.type==='add'?action.quantity??1:action.quantity;
    return changeVariantCart(getSupabaseClient(),accessToken,action.variantId,mode,quantity,mode==='add'?null:existing?.quantity??0,crypto.randomUUID()).then((loaded):CartOutcome=>{
      if(identity.current===userId&&epoch.current===generation){
        const items=withPending(loaded.items,guest.current,catalog.status==='ready'?catalog.products:[]);
        current.current=items;setSaved({userId,items});
        // A confirmed change supersedes any pending reconciliation request.
        setRecoveryRecord(null);
        return {kind:'confirmed',items};
      }
      return {kind:'superseded'};
    }).catch((reason):CartOutcome=>{
      if(!(identity.current===userId&&epoch.current===generation))return {kind:'superseded'};
      const failure=reason instanceof VariantCartError?reason.kind:'uncertain';
      const message=reason instanceof VariantCartError?reason.message:'Your Bag change could not be confirmed. Refresh it before trying again.';
      // Quantity changes keep the Bag-level error and retry action. Add/remove
      // action callers own their single action-specific notification.
      if(action.type==='quantity')setError(message);
      else if(bagFailureNeedsRefresh(failure))setRecoveryRecord({owner:userId??null,value:{status:'required',message:bagRecoveryNote(failure)}});
      return {kind:'rejected',message,failure};
    }).finally(()=>{if(identity.current===userId&&epoch.current===generation){locked.current=false;setStatus('ready');}});
  }
  /**
   * Reconciles the saved Bag by re-reading the trusted server state. It never
   * repeats the change that could not be confirmed, never mints a replacement
   * operation id for it, and never runs while another restore is in flight.
   */
  function refreshSavedCart(){
    if(!userId||!accessToken||refreshing.current)return;
    if(status==='loading'||status==='saving'||status==='checking-out')return;
    if(!recovery)return;
    refreshing.current=true;
    setRecoveryRecord(current=>current&&current.owner===(userId??null)?{...current,value:{...current.value,status:'refreshing'}}:current);
    setRevision(value=>value+1);
  }
  const items=visibleCart(auth.loading,userId,saved,guestItems);
  function beginCheckout(){if(!userId||locked.current||status!=='ready'||items.some(item=>!item.variantId))return null;const ticket=++checkoutSequence.current;checkout.current={ticket,epoch:epoch.current};locked.current=true;setStatus('checking-out');return ticket;}
  function finishCheckout(placed:boolean,ticket:number|null|undefined){if(!userId||identity.current!==userId||!checkout.current||checkout.current.ticket!==ticket||checkout.current.epoch!==epoch.current)return;checkout.current=null;if(placed){current.current=[];setSaved({userId,items:[]});}locked.current=false;setStatus('ready');}
  return <CartContext.Provider value={{items,dispatch,status,error,retry:()=>setRevision(value=>value+1),recovery,refreshSavedCart,beginCheckout,finishCheckout}}>{children}</CartContext.Provider>;
}
