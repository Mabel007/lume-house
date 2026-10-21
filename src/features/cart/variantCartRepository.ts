import type {SupabaseClient} from '@supabase/supabase-js';
import type {CartItem} from './cart.ts';

/**
 * How a trusted cart mutation failed.
 *
 * - `schema_not_ready`: the trusted cart function is not deployed yet, so the
 *   request never ran. Nothing was applied and a refresh cannot help.
 * - `cart_changed`: the server refused because the saved Bag changed in another
 *   session. Nothing was applied, but the local snapshot is stale.
 * - `rejected`: the server answered with a database error, so the request was
 *   refused and rolled back. Nothing was applied.
 * - `uncertain`: no server answer was received. The request may or may not have
 *   been applied, so the saved Bag must be re-read before anything else.
 */
export type CartFailureKind = 'schema_not_ready' | 'cart_changed' | 'rejected' | 'uncertain';

const FAILURE_MESSAGES: Record<CartFailureKind, string> = {
  schema_not_ready:
    'Your saved Bag is waiting for the commerce update. Guest items are retained. Please retry after the update.',
  cart_changed: 'Your Bag changed in another session. Refresh it and review before continuing.',
  rejected: 'Your Bag change could not be confirmed. Please try again.',
  uncertain: 'Your Bag change could not be confirmed. Refresh it before trying again.',
};

/** Application-level refusals raised by the trusted cart function. */
const REFUSED_MESSAGES = new Set([
  'INVALID_REQUEST',
  'PRODUCT_UNAVAILABLE',
  'CART_LIMIT',
  'AUTH_REQUIRED',
]);

type RawError = { code?: string | null; message?: string | null };

/**
 * Classifies a PostgREST/Postgres error without trusting anything the browser
 * can influence. An empty code means no server answer reached the client, so the
 * outcome of the mutation is unknown; a database error code means the request was
 * refused and rolled back.
 */
export function classifyCartFailure(error: RawError): CartFailureKind {
  const code = (error.code ?? '').trim();
  const message = (error.message ?? '').trim();
  if (code === 'PGRST202') return 'schema_not_ready';
  if (message === 'CART_CHANGED') return 'cart_changed';
  if (code === '') return 'uncertain';
  if (code === 'PGRST116') return 'uncertain';
  if (REFUSED_MESSAGES.has(message)) return 'rejected';
  if (/^\d{5}$/.test(code)) return 'rejected';
  return 'uncertain';
}

export class VariantCartError extends Error {
  code: string;
  kind: CartFailureKind;
  constructor(code: string, kind: CartFailureKind) {
    super(FAILURE_MESSAGES[kind]);
    this.code = code;
    this.kind = kind;
  }
}

function variantCartError(error: RawError): VariantCartError {
  const kind = classifyCartFailure(error);
  const code =
    kind === 'schema_not_ready'
      ? 'SCHEMA_NOT_READY'
      : kind === 'cart_changed'
        ? 'CART_CHANGED'
        : (error.message ?? '');
  return new VariantCartError(code, kind);
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
  if(error)throw variantCartError(error);
  return parseVariantCart(data);
}
export async function changeVariantCart(client:SupabaseClient,accessToken:string,variantId:string,mode:'add'|'set'|'remove'|'merge',quantity:number|null,expected:number|null,operationId:string) {
  const {data,error}=await client.rpc('change_variant_cart',{p_variant_id:variantId,p_mode:mode,p_quantity:quantity,p_expected_quantity:expected,p_operation_id:operationId}).setHeader('Authorization',`Bearer ${accessToken}`);
  if(error)throw variantCartError(error);
  return parseVariantCart(data);
}
