import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {cartReducer,cartLineKey,getCartLines,type CartItem,type CartAction} from './cart';
import {CartContext} from './CartContext';
import {useAuth} from '../auth/AuthContext';
import {useProducts} from '../products/ProductContext';
import {getSupabaseClient} from '../../lib/supabase/client';
import {visibleCart} from './cartRepository';
import {readGuestCart,resolveGuestCart,serializeGuestCart,stampGuestIntent} from './guestCart';
import {loadVariantCart,changeVariantCart,VariantCartError} from './variantCartRepository';
import type {Product} from '../products/products';
const storageKey='lume-guest-cart';
function readGuest(){try{return readGuestCart(sessionStorage.getItem(storageKey));}catch{return [];}}
function pendingGuest(items:CartItem[],products:Product[]){return items.filter(item=>!item.variantId||getCartLines([item],products).length===0);}
function withPending(items:CartItem[],guest:CartItem[],products:Product[]){return [...items,...pendingGuest(guest,products).filter(item=>!items.some(saved=>cartLineKey(saved)===cartLineKey(item)))];}
export function CartProvider({children}:{children:ReactNode}) {
  const auth=useAuth();const {state:catalog}=useProducts();const userId=auth.session?.user.id;const accessToken=auth.session?.access_token;
  const identity=useRef(userId);const epoch=useRef(0);
  const checkoutSequence=useRef(0);const checkout=useRef<{ticket:number;epoch:number}|null>(null);
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
        }
      }catch(reason){if(isCurrent()){setError(reason instanceof VariantCartError&&reason.code==='SCHEMA_NOT_READY'?reason.message:'Your saved Bag could not be restored or merged. Unsaved guest items are retained. Please retry.');setStatus('error');}}
    }
    void restore();return()=>{active=false;};
  },[userId,accessToken,auth.loading,catalog,revision]);
  function dispatch(action:CartAction) {
    if(auth.loading||locked.current)return;
    if(!userId){storeGuest(cartReducer(guest.current,action));return;}
    if(action.type==='remove'&&pendingGuest(guest.current,catalog.status==='ready'?catalog.products:[]).some(item=>cartLineKey(item)===cartLineKey(action))){
      storeGuest(guest.current.filter(item=>cartLineKey(item)!==cartLineKey(action)));setRevision(value=>value+1);return;
    }
    if(!action.variantId){
      if(action.type==='remove'){
        storeGuest(guest.current.filter(item=>cartLineKey(item)!==cartLineKey(action)));
        const items=current.current.filter(item=>cartLineKey(item)!==cartLineKey(action));current.current=items;setSaved({userId,items});setError(null);
      }
      return;
    }
    if(!accessToken)return;
    const before=current.current;const next=cartReducer(before,action);if(next===before)return;
    const existing=before.find(item=>cartLineKey(item)===cartLineKey(action));const generation=epoch.current;
    locked.current=true;setStatus('saving');setError(null);
    const mode=action.type==='add'?'add':action.type==='quantity'?'set':'remove';
    const quantity=action.type==='remove'?null:action.type==='add'?action.quantity??1:action.quantity;
    void changeVariantCart(getSupabaseClient(),accessToken,action.variantId,mode,quantity,mode==='add'?null:existing?.quantity??0,crypto.randomUUID()).then(loaded=>{
      if(identity.current===userId&&epoch.current===generation){const items=withPending(loaded.items,guest.current,catalog.status==='ready'?catalog.products:[]);current.current=items;setSaved({userId,items});}
    }).catch(reason=>{
      if(identity.current===userId&&epoch.current===generation)setError(reason instanceof VariantCartError?reason.message:'Your Bag change could not be confirmed. Refresh it before trying again.');
    }).finally(()=>{if(identity.current===userId&&epoch.current===generation){locked.current=false;setStatus('ready');}});
  }
  const items=visibleCart(auth.loading,userId,saved,guestItems);
  function beginCheckout(){if(!userId||locked.current||status!=='ready'||items.some(item=>!item.variantId))return null;const ticket=++checkoutSequence.current;checkout.current={ticket,epoch:epoch.current};locked.current=true;setStatus('checking-out');return ticket;}
  function finishCheckout(placed:boolean,ticket:number|null|undefined){if(!userId||identity.current!==userId||!checkout.current||checkout.current.ticket!==ticket||checkout.current.epoch!==epoch.current)return;checkout.current=null;if(placed){current.current=[];setSaved({userId,items:[]});}locked.current=false;setStatus('ready');}
  return <CartContext.Provider value={{items,dispatch,status,error,retry:()=>setRevision(value=>value+1),beginCheckout,finishCheckout}}>{children}</CartContext.Provider>;
}
