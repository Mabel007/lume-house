import type {ExportKind} from '../adminCsv';
import {orderStates,paymentStates} from '../../orders/orders';
export type RecordFilters=Record<string,string>;
export const sortOptions:Record<ExportKind,readonly [string,string][]>={orders:[['created_at','Placed date'],['reference','Order reference'],['status','Operational status'],['total','Amount']],products:[['name','Product name'],['updated_at','Updated date'],['publication','Publication'],['display_order','Display order']],inventory:[['product_name','Product name'],['available_quantity','Available stock'],['updated_at','Updated date']]};
export const filterKeys:Record<ExportKind,readonly string[]>={orders:['query','status','fulfilment','payment','from','to','sort','direction'],products:['query','category','publication','sort','direction'],inventory:['query','policy','attention','sort','direction']};
export function validateRecordFilters(kind:ExportKind,value:unknown):RecordFilters {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid filters.');
 const filters:RecordFilters={};for(const [key,item]of Object.entries(value)){if(!filterKeys[kind].includes(key)||typeof item!=='string')throw new Error('Unsupported filter.');if(item)filters[key]=item;}
 const enums:Record<string,readonly string[]>={status:orderStates,payment:paymentStates,fulfilment:['pickup','delivery'],publication:['active','archived'],policy:['tracked','untracked'],attention:['zero','unconfigured','available'],sort:sortOptions[kind].map(([key])=>key),direction:['asc','desc']};
 for(const [key,value]of Object.entries(filters)){if(enums[key]&&!enums[key].includes(value)||key==='query'&&value.length>200||key==='category'&&value.length>100)throw new Error('Invalid filter option.');}
 if(filters.from||filters.to){const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().replace('.000Z','Z')===value.replace('.000Z','Z');if(!filters.from||!filters.to||!valid(filters.from)||!valid(filters.to)||Date.parse(filters.to)<=Date.parse(filters.from))throw new Error('Choose a valid complete date range.');}
 return filters;
}
export function filtersFromSearch(kind:ExportKind,search:string):RecordFilters{const params=new URLSearchParams(search);const value=Object.fromEntries(filterKeys[kind].flatMap(key=>params.has(key)?[[key,params.get(key)]]:[]));return validateRecordFilters(kind,value);}
export function filterSearch(filters:RecordFilters):string{return new URLSearchParams(filters).toString();}
