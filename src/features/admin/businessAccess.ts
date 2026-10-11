import type {SupabaseClient} from '@supabase/supabase-js';
import {checkAdmin} from './adminRepository';
import {adminDate,adminInteger,adminRecord,adminText,parseAdminRows} from './adminValidation';

export type BusinessAccess='legacy'|'owner'|'staff';
export async function checkBusinessAccess(client:SupabaseClient,token:string):Promise<BusinessAccess|null>{
 const {data,error}=await client.rpc('business_access_v1').setHeader('Authorization',`Bearer ${token}`);
 // Only an absent expand-first migration permits legacy fallback. Network and
 // authorization failures never cause an unrestricted-admin fallback.
 if(error?.code==='PGRST202'||error?.code==='42883')return await checkAdmin(client,token)?'legacy':null;
 if(error?.code==='42501')return null;
 if(error||!['legacy','owner','staff'].includes(data as string))throw new Error('Business access could not be checked.');
 return data as BusinessAccess;
}
const statuses=['placed','confirmed','processing','ready_for_pickup','out_for_delivery','completed','cancelled'];
export type StaffOrder={order_reference:string;created_at:string;status:string;total_cents:number};
export function parseStaffOrders(value:unknown):{items:StaffOrder[];has_more:boolean}{
 const row=adminRecord(value);if(typeof row.has_more!=='boolean')throw new Error('Invalid order page.');
 return {has_more:row.has_more,items:parseAdminRows(row.items,value=>{const item=adminRecord(value);const status=adminText(item.status,30);if(!statuses.includes(status))throw new Error('Invalid order status.');return {order_reference:adminText(item.order_reference,100),created_at:adminDate(item.created_at),status,total_cents:adminInteger(item.total_cents)};},item=>item.order_reference,20)};
}
export function parseStaffDashboard(value:unknown){const row=adminRecord(value);return {open_orders:adminInteger(row.open_orders),completed_orders:adminInteger(row.completed_orders),cancelled_orders:adminInteger(row.cancelled_orders)};}
