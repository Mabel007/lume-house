import {adminRecord,adminText,adminDate,adminInteger,parseAdminRows} from './adminValidation';
import {optionRows,serializeOptions} from './variantOptions';
export type AdminVariant={id:string;product_id:string;sku:string;options:Record<string,string>;is_default:boolean;price_cents:number;currency:'NLE';active:boolean;inventory_policy:'tracked'|'untracked';updated_at:string};
export function parseAdminVariant(value:unknown,parent?:string):AdminVariant {
 const row=adminRecord(value);const id=adminText(row.id,150),product_id=adminText(row.product_id,150),sku=adminText(row.sku,150);
 if(parent!==undefined&&product_id!==parent)throw new Error('Invalid variant parent.');
 if(typeof row.is_default!=='boolean'||typeof row.active!=='boolean'||row.currency!=='NLE'||!['tracked','untracked'].includes(String(row.inventory_policy)))throw new Error('Invalid variant response.');
 const options=serializeOptions(optionRows(row.options));
 if(row.is_default?(id!==`default:${product_id}`||sku!==`DEFAULT-${product_id}`||Object.keys(options).length!==0):(id.startsWith('default:')||sku.startsWith('DEFAULT-')||Object.keys(options).length===0))throw new Error('Invalid variant identity.');
 return {id,product_id,sku,options,is_default:row.is_default,price_cents:adminInteger(row.price_cents),currency:'NLE',active:row.active,inventory_policy:row.inventory_policy as AdminVariant['inventory_policy'],updated_at:adminDate(row.updated_at)};
}
export function parseAdminVariants(value:unknown,parent:string):AdminVariant[] {
 const rows=parseAdminRows(value,row=>parseAdminVariant(row,parent),row=>row.id);const skus=new Set<string>(),options=new Set<string>();
 for(const row of rows){const signature=JSON.stringify(row.options);if(skus.has(row.sku)||options.has(signature))throw new Error('Duplicate variant identity.');skus.add(row.sku);options.add(signature);}
 return rows;
}
