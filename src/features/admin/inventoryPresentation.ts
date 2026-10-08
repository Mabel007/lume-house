import {adminRecord,adminInteger} from './adminValidation';
import { optionRows } from './variantOptions';
export type InventoryRow = {variant_id:string;product_name:string;sku:string;options:Record<string,string>;active:boolean;inventory_policy:'tracked'|'untracked';updated_at:string;on_hand:number|null;allocated:number|null;available:boolean};
export type InventoryHistoryRow = {id:string;event:'stock_adjustment'|'order_allocation'|'order_release'|'order_consumption';reason:string;created_at:string;on_hand_delta:number;allocated_delta:number;on_hand_after:number;allocated_after:number;order_id:string|null};
const maximum=2147483647;
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid inventory response.');return value as Record<string,unknown>;}
function text(value:unknown,max=150):string{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error('Invalid inventory response.');return value;}
function date(value:unknown):string{const result=text(value);if(!Number.isFinite(Date.parse(result)))throw new Error('Invalid inventory timestamp.');return result;}
function integer(value:unknown,signed=false):number{if(typeof value!=='number'||!Number.isInteger(value)||value>maximum||value<(signed?-2147483648:0))throw new Error('Invalid inventory quantity.');return value;}
export function parseInventoryRow(value:unknown):InventoryRow {
 const row=record(value);if(!['tracked','untracked'].includes(String(row.inventory_policy))||typeof row.active!=='boolean'||typeof row.available!=='boolean')throw new Error('Invalid inventory response.');
 const options=Object.fromEntries(optionRows(row.options).map(item=>[item.name,item.value]));
 const on_hand=row.on_hand===null?null:integer(row.on_hand);const allocated=row.allocated===null?null:integer(row.allocated);
 if((on_hand===null)!==(allocated===null)||(on_hand!==null&&allocated!==null&&allocated>on_hand))throw new Error('Invalid inventory balance.');
 return {variant_id:text(row.variant_id),product_name:text(row.product_name,200),sku:text(row.sku),options,active:row.active,inventory_policy:row.inventory_policy as InventoryRow['inventory_policy'],updated_at:date(row.updated_at),on_hand,allocated,available:row.available};
}
export function parseInventoryHistory(value:unknown):InventoryHistoryRow {
 const row=record(value);if(!['stock_adjustment','order_allocation','order_release','order_consumption'].includes(String(row.event)))throw new Error('Invalid inventory event.');
 const on_hand_after=integer(row.on_hand_after);const allocated_after=integer(row.allocated_after);if(allocated_after>on_hand_after)throw new Error('Invalid inventory history balance.');
 const id=text(row.id);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error('Invalid inventory event identifier.');
 const order_id=row.order_id===null?null:text(row.order_id);if(order_id!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id))throw new Error('Invalid inventory order reference.');
 return {id,event:row.event as InventoryHistoryRow['event'],reason:text(row.reason,500),created_at:date(row.created_at),on_hand_delta:integer(row.on_hand_delta,true),allocated_delta:integer(row.allocated_delta,true),on_hand_after,allocated_after,order_id};
}
export function availableQuantity(row:InventoryRow):number|null{return row.inventory_policy==='tracked'&&row.on_hand!==null&&row.allocated!==null?row.on_hand-row.allocated:null;}
export function inventoryOptions(row:InventoryRow):string{return Object.entries(row.options??{}).map(([name,value])=>`${name}: ${value}`).join(' · ')||'No structured options';}
export function filterInventory(rows:InventoryRow[],query:string,policy:string):InventoryRow[]{const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);return rows.filter(row=>(!policy||row.inventory_policy===policy)&&terms.every(term=>`${row.product_name} ${row.sku} ${inventoryOptions(row)}`.toLocaleLowerCase().includes(term)));}
export function adjustmentPreview(row:InventoryRow,input:string):string {
 if(!input.trim())return 'Enter a signed whole-number quantity change.';
 if(!/^-?\d+$/.test(input.trim())||!Number.isInteger(Number(input))||Number(input)<-2147483648||Number(input)>maximum)return 'Use a whole number within the supported quantity range.';
 const delta=Number(input);const signed=delta>0?`+${delta}`:String(delta);
 if(row.on_hand===null)return `Proposed change: ${signed}. Balance is not configured; no current quantity is assumed. The server validates preparation.`;
 const candidate=row.on_hand+delta;
 if(candidate<(row.allocated??0)||candidate>maximum)return `Proposed change: ${signed}. This would exceed the allowed balance or fall below allocated stock. The server will reject it.`;
 return `Proposed change: ${signed}. On hand: ${row.on_hand} → ${candidate}. Allocated: ${row.allocated}. Preview only; the server validates the current balance.`;
}
export const inventoryEventLabels:Record<InventoryHistoryRow['event'],string>={stock_adjustment:'Stock adjustment',order_allocation:'Order stock allocated',order_release:'Order allocation released',order_consumption:'Order stock consumed'};

export function parseInventoryAdjustment(value:unknown):{on_hand:number;allocated:number} {
 const row=adminRecord(value);const on_hand=adminInteger(row.on_hand),allocated=adminInteger(row.allocated);if(allocated>on_hand)throw new Error('Invalid inventory adjustment response.');return {on_hand,allocated};
}
