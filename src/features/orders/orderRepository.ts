import type { SupabaseClient } from '@supabase/supabase-js';
import { parseOrder, parseOrderList, type CheckoutInput } from './orders.ts';
import type { CheckoutAttempt, DirectAttempt } from './checkoutAttempt.ts';
export const historyPageSize = 20;
export async function loadOrders(client: SupabaseClient, page = 0) {
  const { data,error } = await client.from('orders').select('id,order_reference,created_at,total_cents,currency,fulfilment_method,status,payment_status').order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*historyPageSize,(page+1)*historyPageSize-1);
  if (error) throw new Error('Your orders could not be loaded.');
  return (data || []).map(parseOrderList);
}
export async function loadOrder(client: SupabaseClient, id: string) {
  const { data,error } = await client.from('orders').select('id,order_reference,created_at,total_cents,currency,fulfilment_method,status,payment_status,full_name,customer_email,customer_phone,delivery_street_address,delivery_area,delivery_city,delivery_zone_label,delivery_instructions,pickup_location,payment_provider,payment_phone_last4,subtotal_cents,delivery_fee_cents,order_items(product_name,quantity,unit_price_cents,variant_id,variant_sku,variant_options,variant_currency)').eq('id',id).maybeSingle();
  if (error) throw new Error('Your order could not be loaded.');
  return data ? parseOrder(data) : null;
}
export class CheckoutError extends Error { code:string; definitive:boolean; constructor(code:string, definitive=false) { super(code); this.code=code; this.definitive=definitive; } }
export async function recoverCheckout(client: SupabaseClient, attempt: CheckoutAttempt): Promise<string | null> {
  const { data: { session } } = await client.auth.getSession();
  if (!session || session.user.id !== attempt.ownerId) throw new CheckoutError('AUTH_REQUIRED');
  const query=client.from('orders').select('id,checkout_source,order_items(variant_id,quantity)').eq('user_id',attempt.ownerId).eq('checkout_request_id',attempt.requestId);
  const {data,error}=await query.setHeader('Authorization',`Bearer ${session.access_token}`).maybeSingle();
  if(error)throw new CheckoutError('RECOVERY_UNAVAILABLE');
  if(!data)return null; // Unknown/in-flight is never proof that no order will commit.
  if(data.checkout_source!==attempt.source)throw new CheckoutError('CHECKOUT_SOURCE_CONFLICT');
  if(attempt.source==='direct' && (!Array.isArray(data.order_items)||data.order_items.length!==1||data.order_items[0].variant_id!==attempt.variantId||data.order_items[0].quantity!==attempt.quantity))throw new CheckoutError('CHECKOUT_SELECTION_CONFLICT');
  if(typeof data.id!=='string')throw new CheckoutError('RECOVERY_UNAVAILABLE');
  return data.id;
}
export async function placeDirectOrder(client: SupabaseClient, attempt: DirectAttempt, checkout: CheckoutInput, quote: {product_id:string;variant_id:string;quantity:number;unit_price:number}) {
  const {data:{session}}=await client.auth.getSession();
  if(!session||session.user.id!==attempt.ownerId)throw new CheckoutError('AUTH_REQUIRED');
  const {data,error}=await client.functions.invoke('place-direct-order',{body:{protocol:1,request_id:attempt.requestId,variant_id:attempt.variantId,quantity:attempt.quantity,expected_quote:quote,checkout},headers:{Authorization:`Bearer ${session.access_token}`}});
  if(error){
    let code='ORDER_UNAVAILABLE';let definitive=false;
    try{if(error.context instanceof Response){const body=await error.context.json();if(typeof body.error==='string')code=body.error;definitive=body.outcome==='rejected';}}catch{/* Preserve uncertain result and never echo upstream content. */}
    throw new CheckoutError(code,definitive);
  }
  if(data?.protocol!==1||data.checkout_source!=='direct'||data.request_id!==attempt.requestId||typeof data.order?.id!=='string'||!/^[0-9a-f-]{36}$/i.test(data.order.id))throw new CheckoutError('DIRECT_UNAVAILABLE');
  return {id:data.order.id as string};
}
export async function findCheckout(client:SupabaseClient,requestId:string) {
  const {data,error}=await client.from('orders').select('id').eq('checkout_request_id',requestId).maybeSingle();
  if(error)throw new Error('Previous checkout could not be checked.');
  return data?.id as string | undefined;
}
export async function placeOrder(client: SupabaseClient, requestId: string, checkout: CheckoutInput, expectedCart: {product_id:string;variant_id?:string;quantity:number;unit_price:number}[], expectedUserId?:string) {
  const { data:{session} } = await client.auth.getSession();
  if (!session || expectedUserId && session.user.id!==expectedUserId) throw new CheckoutError('AUTH_REQUIRED');
  const { data,error } = await client.functions.invoke('place-order',{body:{request_id:requestId,checkout,expected_cart:expectedCart,...(expectedCart.length && expectedCart.every(item=>typeof item.variant_id==='string')?{cart_version:2}:{})},headers:{Authorization:`Bearer ${session.access_token}`}});
  if (error) {
    let code = 'ORDER_UNAVAILABLE';
    try { if (error.context instanceof Response) { const body = await error.context.json(); if(typeof body.error==='string') code=body.error; } } catch { /* Never echo raw provider errors. */ }
    throw new CheckoutError(code);
  }
  if (!data?.order || typeof data.order.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.order.id)) throw new CheckoutError('ORDER_UNAVAILABLE');
  return { id:data.order.id as string, emailStatus:typeof data.email_status==='string'?data.email_status:'queued' };
}
export async function retryConfirmation(client: SupabaseClient, id: string) {
  const { data,error } = await client.functions.invoke('order-email',{body:{order_id:id}});
  if (error) throw new Error('Confirmation email could not be checked. Your order is still saved.');
  return data?.email_status === 'sent' ? 'Confirmation email accepted for sending.' : data?.email_status === 'review_required' ? 'Confirmation email needs a manual review. Your order is saved.' : 'Confirmation email is queued. You can retry in a minute; your order is saved.';
}
