import type {SupabaseClient} from '@supabase/supabase-js';
import type {CartItem} from './cart.ts';

/**
 * How a trusted cart mutation failed.
 *
 * - `schema_not_ready`: the trusted cart function is not deployed yet, so the
 *   request never ran. Nothing was applied and a refresh cannot help.
 * - `cart_changed`: the server refused because the saved Cart changed in another
 *   session. Nothing was applied, but the local snapshot is stale.
 * - `rejected`: the server answered with a database error, so the request was
 *   refused and rolled back. Nothing was applied.
 * - `uncertain`: no server answer was received. The request may or may not have
 *   been applied, so the saved Cart must be re-read before anything else.
 */
export type CartFailureKind = 'schema_not_ready' | 'cart_changed' | 'rejected' | 'uncertain';

const FAILURE_MESSAGES: Record<CartFailureKind, string> = {
  schema_not_ready:
    'Your saved Cart is waiting for the commerce update. Guest items are retained. Please retry after the update.',
  cart_changed: 'Your Cart changed in another session. Refresh it and review before continuing.',
  rejected: 'Your Cart change could not be confirmed. Please try again.',
  uncertain: 'Your Cart change could not be confirmed. Refresh it before trying again.',
};

/** Application-level refusals raised by the trusted cart function. */
const REFUSED_MESSAGES = new Set([
  'INVALID_REQUEST',
  'PRODUCT_UNAVAILABLE',
  'CART_LIMIT',
  'AUTH_REQUIRED',
]);

/**
 * SQLSTATE classes that are known to abort the transaction before anything
 * could be committed:
 *
 * - `22` data exception,
 * - `23` integrity constraint violation,
 * - `42` syntax error or access rule violation, raised while the statement is
 *   parsed or planned, before it runs.
 *
 * A code outside this list is not proof that nothing was applied. `08`
 * (connection exception) and `40` (transaction rollback) can leave the
 * completion of the statement or of the transaction unknown, so they are never
 * treated as a definite refusal. A raised refusal is only a definite refusal
 * when the trusted function names it, which is handled above.
 */
const ROLLED_BACK_CLASSES = new Set(['22', '23', '42']);

type RawError = { code?: string | null; message?: string | null };

/**
 * Classifies a PostgREST/Postgres error without trusting anything the browser
 * can influence. An empty code means no server answer reached the client, so the
 * outcome of the mutation is unknown. A database error code is only proof of a
 * refusal when the code is known to roll the transaction back; every other code,
 * including an unknown completion, leaves the outcome uncertain.
 */
export function classifyCartFailure(error: RawError): CartFailureKind {
  const code = (error.code ?? '').trim();
  const message = (error.message ?? '').trim();
  if (code === 'PGRST202') return 'schema_not_ready';
  if (message === 'CART_CHANGED') return 'cart_changed';
  if (code === '') return 'uncertain';
  if (code === 'PGRST116') return 'uncertain';
  if (REFUSED_MESSAGES.has(message)) return 'rejected';
  if (ROLLED_BACK_CLASSES.has(code.slice(0, 2))) return 'rejected';
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
  if(!value||typeof value!=='object'||!('id' in value)||typeof value.id!=='string'||!('items' in value)||!Array.isArray(value.items))throw new Error('Your saved Cart could not be loaded.');
  const ids=new Set<string>();
  const items=value.items.map(row=>{
    if(!row||typeof row!=='object'||typeof row.product_id!=='string'||typeof row.variant_id!=='string'||!row.variant_id||ids.has(row.variant_id)||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>99)throw new Error('Your saved Cart contains invalid items.');
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
