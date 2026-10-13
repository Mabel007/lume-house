import {filtersFromSearch} from './filters/recordFilters';
import {adminRecord,adminText,adminDate,parseAdminRows} from './adminValidation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseOrder, parseOrderList, orderStates, paymentStates, type OrderListItem, type Order } from '../orders/orders';
import { adminRpc } from './adminRepository';

export type AdminOrderListItem = OrderListItem & { full_name: string };
export function parseAdminOrderList(value: unknown): AdminOrderListItem {
  const base = parseOrderList(value);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base.id))throw new Error('Invalid admin order data.');
  const name = (value as Record<string, unknown>).full_name;
  if (typeof name !== 'string' || !name.trim()) throw new Error('Invalid admin order data.');
  return { ...base, full_name: name };
}
export function orderFilters(search: string) {
  const params = new URLSearchParams(search);
  const status = params.get('status') ?? '';
  return { query: (params.get('query') ?? '').slice(0, 200), status: orderStates.includes(status) ? status : '' };
}
export function orderFilterSearch(search: string): string {
  const { query, status } = orderFilters(search);
  let extended:Record<string,string>={};try{extended=filtersFromSearch('orders',search);}catch{/* Preserve validated legacy fields below. */}
  const params = new URLSearchParams(extended);
  if (query) params.set('query', query);
  if (status) params.set('status', status);
  return params.size ? `?${params}` : '';
}
export function orderListUrl(search: string) { return `/admin/orders${orderFilterSearch(search)}`; }
export function orderDetailUrl(id: string, search: string) { return `/admin/orders/${encodeURIComponent(id)}${orderFilterSearch(search)}`; }
export type OrderHistoryEvent = { operation_id: string; from_status: string; to_status: string; reason: string; created_at: string };
export class AdminOrderReadError extends Error {
  constructor(public kind: 'missing' | 'denied' | 'error') { super(kind === 'missing' ? 'Order not found.' : kind === 'denied' ? 'Administration access was denied. Reload to check your access.' : 'Order details could not be loaded.'); }
}
export async function loadAdminOrder(client: SupabaseClient, token: string, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AdminOrderReadError('missing');
  const { data, error } = await client.rpc('admin_get_order', { p_order_id: id }).setHeader('Authorization', `Bearer ${token}`);
  if (error) throw new AdminOrderReadError(error.code === '42501' ? 'denied' : error.code === '22023' && error.message === 'ORDER_NOT_FOUND' ? 'missing' : 'error');
  if (data === null) throw new AdminOrderReadError('missing');
  const order=parseOrder(data);if(order.payment_phone_last4!==null&&!/^\d{4}$/.test(order.payment_phone_last4))throw new AdminOrderReadError('error');if(order.id!==id)throw new AdminOrderReadError('error');return order;
}
export async function loadAdminOrderHistory(client: SupabaseClient, token: string, id: string): Promise<OrderHistoryEvent[]> {
  return parseAdminRows(await adminRpc(client,token,'admin_order_history',{p_order_id:id}),parseAdminOrderHistory,event=>event.operation_id,100);
}
export function parseAdminOrderHistory(value:unknown):OrderHistoryEvent {
 const row=adminRecord(value);if(typeof row.operation_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.operation_id))throw new Error('Invalid operation identifier.');if(!orderStates.includes(String(row.from_status))||!orderStates.includes(String(row.to_status)))throw new Error('Invalid operation history.');
 return {operation_id:adminText(row.operation_id,150),from_status:String(row.from_status),to_status:String(row.to_status),reason:adminText(row.reason,500),created_at:adminDate(row.created_at)};
}
export function confirmOrderTransition(value:unknown,order:Order,to:string):void {
 const row=adminRecord(value);if(row.id!==order.id||row.status!==to||row.payment_status!==order.payment_status||!paymentStates.includes(String(row.payment_status)))throw new Error('Order operation was not confirmed. Review order history before retrying.');
}
