import { useAuth } from "./AuthContext";
import { AccountPage } from "../account/AccountPage";
import { CheckoutPage } from "../checkout/CheckoutPage";
import { MyOrdersPage,OrderDetailPage } from '../orders/OrderPages';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { consumeAdminAuthIntent } from './adminAuthIntent';
export function AuthCallback() {
 const {session,loading}=useAuth();const navigate=useNavigate();
 useEffect(()=>{if(loading||!session)return;try{const target=consumeAdminAuthIntent(window.sessionStorage);if(target)void navigate(target,{replace:true});}catch{/* Continue to the customer Account if browser storage is unavailable. */}},[session,loading,navigate]);
 return <CustomerAccount/>;
}
export function CustomerAccount() { const { session } = useAuth(); return <AccountPage key={session?.user.id || "guest"} />; }
export function CustomerCheckout() { const { session } = useAuth(); return <CheckoutPage key={session?.user.id || "guest"} />; }
export function CustomerOrders(){const {session}=useAuth();return <MyOrdersPage key={session?.user.id||'guest'}/>;}
export function CustomerOrder({success=false}:{success?:boolean}){const {session}=useAuth();const {orderId}=useParams();return <OrderDetailPage key={`${session?.user.id||'guest'}:${orderId}`} success={success}/>;}
