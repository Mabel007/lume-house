import { useAuth } from "./AuthContext";
import { AccountPage } from "../account/AccountPage";
import { CheckoutPage } from "../checkout/CheckoutPage";
import { MyOrdersPage,OrderDetailPage } from '../orders/OrderPages';
import { useParams } from 'react-router-dom';
export function CustomerAccount() { const { session } = useAuth(); return <AccountPage key={session?.user.id || "guest"} />; }
export function CustomerCheckout() { const { session } = useAuth(); return <CheckoutPage key={session?.user.id || "guest"} />; }
export function CustomerOrders(){const {session}=useAuth();return <MyOrdersPage key={session?.user.id||'guest'}/>;}
export function CustomerOrder({success=false}:{success?:boolean}){const {session}=useAuth();const {orderId}=useParams();return <OrderDetailPage key={`${session?.user.id||'guest'}:${orderId}`} success={success}/>;}
