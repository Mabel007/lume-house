import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CheckoutPage } from './CheckoutPage';
import { useDirectState } from './useDirectState';
import { bindDirectIntent, cancelDirectIntent, restoreDirectIntent, resumeDirectIntent } from './directIntent';
import { readAttempt } from '../orders/checkoutAttempt';
import { prepareCustomerAuthReturn } from '../auth/customerAuthIntent';
export function DirectCheckoutPage() {
  const auth=useAuth();const state=useDirectState();const [error,setError]=useState('');const navigate=useNavigate();
  const owner=auth.session?.user.id;
  useEffect(()=>{
    try{
      if(state.intent&&!state.hold)resumeDirectIntent();
      if(auth.loading||!owner)return;
      if(state.intent&&!state.intent.ownerId)bindDirectIntent(owner);
      else if(!state.intent&&!state.invalid){
        const pending=readAttempt(owner);
        if(pending?.source==='direct')restoreDirectIntent({id:pending.intentId,productId:pending.productId,variantId:pending.variantId,quantity:pending.quantity,ownerId:owner});
      }
    }catch{queueMicrotask(()=>setError('Checkout storage is unavailable. Keep your browser data and check My Orders.'));}
  },[owner,auth.loading,state.intent?.id,state.intent?.ownerId,state.hold,state.invalid]); // eslint-disable-line react-hooks/exhaustive-deps
  async function signIn(){try{prepareCustomerAuthReturn();await auth.signIn();}catch{setError('Sign-in continuation could not be saved. Please retry in this tab.');}}
  function leave(){try{cancelDirectIntent();navigate('/');}catch{setError('Checkout selection could not be cleared.');}}
  if(auth.loading)return <section className="wrap page-section"><h1>Buy Now checkout.</h1><p role="status">Restoring your session…</p></section>;
  if(error||state.invalid||!state.intent)return <section className="wrap page-section"><h1>Your Buy Now selection is unavailable.</h1><p role="alert">{error||'Return to the product to choose a piece. Any unresolved order request is retained.'}</p><Link to="/account/orders">Check My Orders</Link> <Link to="/" onClick={()=>{try{cancelDirectIntent();}catch{/* Fail closed if storage is blocked. */}}}>Back to shop</Link></section>;
  if(state.intent.ownerId&&state.intent.ownerId!==owner)return <section className="wrap page-section"><h1>Use the original account.</h1><p>This checkout belongs to another sign-in. Its order request is retained for that account.</p>{owner?<button type="button" className="button" onClick={()=>void auth.signOut()}>Sign out</button>:<button type="button" className="button" onClick={()=>void signIn()}>Sign in with Google</button>} <button type="button" className="text-link" onClick={leave}>Leave this selection</button>{auth.error&&<p role="alert">{auth.error}</p>}</section>;
  if(owner&&!state.intent.ownerId)return <p role="status">Preparing your checkout…</p>;
  return <CheckoutPage key={`${state.intent.id}:${owner??'guest'}:${auth.sessionGeneration??0}`} direct={state.intent}/>;
}
