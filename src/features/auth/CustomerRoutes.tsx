import { useAuth } from "./AuthContext";
import { AccountPage } from "../account/AccountPage";
import { CheckoutPage } from "../checkout/CheckoutPage";
import { MyOrdersPage,OrderDetailPage } from '../orders/OrderPages';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { consumeAdminAuthIntent } from './adminAuthIntent';
import { consumeCustomerAuthReturn, hasCustomerAuthReturn } from './customerAuthIntent';
import { directCheckoutPath } from '../checkout/directIntent';
export function AuthCallback() {
 const {session,loading}=useAuth();const navigate=useNavigate();
 useEffect(()=>{if(loading||!session)return;try{const target=consumeAdminAuthIntent(window.sessionStorage)||consumeCustomerAuthReturn();if(target)void navigate(target,{replace:true});}catch{/* Continue to the customer Account if browser storage is unavailable. */}},[session,loading,navigate]);
 if(hasCustomerAuthReturn()&&!loading&&!session)return <section className="wrap page-section"><h1>Sign-in was not completed.</h1><p>Your selection is retained. Return to review it and retry Google sign-in.</p><Link className="button" to={directCheckoutPath}>Return to Buy Now review</Link></section>;
 return hasCustomerAuthReturn()?<section className="wrap page-section"><p role="status">Returning to checkout…</p></section>:<CustomerAccount/>;
}
export function CustomerAccount() { const { session } = useAuth(); return <AccountPage key={session?.user.id || "guest"} />; }
export function CustomerCheckout() { const { session,sessionGeneration } = useAuth(); return <CheckoutPage key={`${session?.user.id || "guest"}:${sessionGeneration??0}`} />; }
export function CustomerOrders(){const {session}=useAuth();return <MyOrdersPage key={session?.user.id||'guest'}/>;}
export function CustomerOrder({success=false}:{success?:boolean}){const {session}=useAuth();const {orderId}=useParams();return <OrderDetailPage key={`${session?.user.id||'guest'}:${orderId}`} success={success}/>;}
