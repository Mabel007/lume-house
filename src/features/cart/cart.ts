import type { ProductVariant } from '../products/variants.ts';
import {variantAvailable} from '../products/variants.ts';
export type CartItem = { productId: string; variantId?: string; quantity: number; mergeId?: string };
type Identity = { productId: string; variantId?: string };
export type CartAction =
  | (Identity & { type: 'add'; quantity?: number })
  | (Identity & { type: 'quantity'; quantity: number })
  | (Identity & { type: 'remove' });
export const MAX_QUANTITY=99;
export function cartLineKey(item: Identity): string { return item.variantId ? `v:${item.variantId}` : `p:${item.productId}`; }
export function cartReducer(state: CartItem[],action: CartAction): CartItem[] {
  const key=cartLineKey(action);
  if(action.type==='remove')return state.filter(item=>cartLineKey(item)!==key);
  if(action.type==='quantity') {
    if(!Number.isInteger(action.quantity)||action.quantity<1||action.quantity>MAX_QUANTITY)return state;
    return state.map(item=>cartLineKey(item)===key?{...item,quantity:action.quantity}:item);
  }
  const amount=action.quantity??1;
  if(!Number.isInteger(amount)||amount<1||amount>MAX_QUANTITY)return state;
  const existing=state.find(item=>cartLineKey(item)===key);
  if(!existing)return [...state,{productId:action.productId,...(action.variantId?{variantId:action.variantId}:{}),quantity:amount}];
  return state.map(item=>cartLineKey(item)===key?{...item,quantity:Math.min(MAX_QUANTITY,item.quantity+amount)}:item);
}
export function defaultVariant(product: {id:string;price:number;variants?: readonly ProductVariant[]}): ProductVariant | undefined {
  // Exact expand-migration mapping only, never arbitrary meaningful options.
  return product.variants===undefined ? {id:`default:${product.id}`,productId:product.id,options:{},isDefault:true,price:product.price,currency:'NLE',inventoryPolicy:'untracked'} : product.variants.find(variant=>variant.isDefault);
}
export function getCartLines<T extends {id:string;price:number;variants?: readonly ProductVariant[]}>(cart:CartItem[],catalog:T[]) {
  return cart.flatMap(item=>{
    const product=catalog.find(product=>product.id===item.productId);
    if(!product)return [];
    const variant=item.variantId ? product.variants?.find(variant=>variant.id===item.variantId)??(item.variantId===`default:${product.id}`&&product.variants===undefined?defaultVariant(product):undefined) : defaultVariant(product);
    if(item.variantId&&!variant || product.variants!==undefined&&!variant || variant&&!variantAvailable(variant))return [];
    const price=variant?.price??product.price;
    return [{product:{...product,price},variant,item,quantity:item.quantity,lineTotal:price*item.quantity,lineKey:cartLineKey(item)}];
  });
}
