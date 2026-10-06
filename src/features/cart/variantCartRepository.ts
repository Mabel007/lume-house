import type {SupabaseClient} from '@supabase/supabase-js';
import type {CartItem} from './cart.ts';
export class VariantCartError extends Error {
  code:string;
  constructor(code:string){super(code==='SCHEMA_NOT_READY'?'Your saved Bag is waiting for the commerce update. Guest items are retained. Please retry after the update.':code==='CART_CHANGED'?'Your Bag changed in another session. Refresh it and review before continuing.':'Your Bag change could not be confirmed. Refresh it before trying again.');this.code=code;}
}
export function parseVariantCart(value:unknown):{id:string;items:CartItem[]} {
  if(!value||typeof value!=='object'||!('id' in value)||typeof value.id!=='string'||!('items' in value)||!Array.isArray(value.items))throw new Error('Your saved Bag could not be loaded.');
  const ids=new Set<string>();
  const items=value.items.map(row=>{
    if(!row||typeof row!=='object'||typeof row.product_id!=='string'||typeof row.variant_id!=='string'||!row.variant_id||ids.has(row.variant_id)||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>99)throw new Error('Your saved Bag contains invalid items.');
    ids.add(row.variant_id);return {productId:row.product_id,variantId:row.variant_id,quantity:row.quantity} as CartItem;
  });
  return {id:value.id,items};
}
export async function loadVariantCart(client:SupabaseClient,accessToken:string) {
  const {data,error}=await client.rpc('load_variant_cart').setHeader('Authorization',`Bearer ${accessToken}`);
  if(error)throw new VariantCartError(error.code==='PGRST202'?'SCHEMA_NOT_READY':error.message);
  return parseVariantCart(data);
}
export async function changeVariantCart(client:SupabaseClient,accessToken:string,variantId:string,mode:'add'|'set'|'remove'|'merge',quantity:number|null,expected:number|null,operationId:string) {
  const {data,error}=await client.rpc('change_variant_cart',{p_variant_id:variantId,p_mode:mode,p_quantity:quantity,p_expected_quantity:expected,p_operation_id:operationId}).setHeader('Authorization',`Bearer ${accessToken}`);
  if(error)throw new VariantCartError(error.code==='PGRST202'?'SCHEMA_NOT_READY':error.message);
  return parseVariantCart(data);
}
