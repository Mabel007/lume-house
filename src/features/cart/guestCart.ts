import {cartLineKey,MAX_QUANTITY,type CartItem,defaultVariant} from './cart.ts';
import type {Product} from '../products/products.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readGuestCart(raw:string|null): CartItem[] {
  try {
    const value:unknown=JSON.parse(raw??'[]');
    const entries=Array.isArray(value)?value:value&&typeof value==='object'&&'version' in value&&value.version===2&&'items' in value?value.items:[];
    if(!Array.isArray(entries))return [];
    const result:CartItem[]=[];
    for(const row of entries) {
      if(!row||typeof row!=='object'||typeof row.productId!=='string'||!row.productId||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>MAX_QUANTITY||row.variantId!==undefined&&(typeof row.variantId!=='string'||!row.variantId))continue;
      const item:CartItem={productId:row.productId,quantity:row.quantity,...(row.variantId?{variantId:row.variantId}:{}),...(typeof row.mergeId==='string'&&uuid.test(row.mergeId)?{mergeId:row.mergeId}:{})};
      const existing=result.find(value=>cartLineKey(value)===cartLineKey(item));
      if(existing)existing.quantity=Math.min(MAX_QUANTITY,existing.quantity+item.quantity);else result.push(item);
    }
    return result;
  } catch {return [];}
}
export function resolveGuestCart(items:CartItem[],products:Product[]):CartItem[] {
  const result:CartItem[]=[];
  for(const item of items){
    const product=products.find(product=>product.id===item.productId);
    const variant=!item.variantId&&product&&defaultVariant(product);
    const resolved=variant?{...item,variantId:variant.id}:item;
    const previous=result.find(value=>cartLineKey(value)===cartLineKey(resolved));
    if(previous){previous.quantity=Math.min(MAX_QUANTITY,previous.quantity+item.quantity);delete previous.mergeId;}
    else result.push({...resolved});
  }
  return result;
}
export function stampGuestIntent(items:CartItem[],before:CartItem[],newId:()=>string=()=>crypto.randomUUID()):CartItem[] {
  return items.map(item=>{
    const previous=before.find(value=>cartLineKey(value)===cartLineKey(item));
    const unchanged=!previous||previous.quantity===item.quantity;
    return {...item,mergeId:unchanged&&item.mergeId?item.mergeId:newId()};
  });
}
export function serializeGuestCart(items:CartItem[]):string {return JSON.stringify({version:2,items});}
