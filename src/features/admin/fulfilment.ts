import {adminDate,adminInteger,adminRecord,adminText,parseAdminRows} from './adminValidation';

export type FulfilmentValue={order_id:string;carrier_label:string|null;tracking_reference:string|null;version:number;updated_at:string|null};
export type FulfilmentHistory={operation_id:string;carrier_label:string|null;tracking_reference:string|null;reason:string;version:number;created_at:string};
export type FulfilmentRead={current:FulfilmentValue;history:FulfilmentHistory[]};
const controls=/\p{Cc}/u;
export function fulfilmentInput(carrier:string,tracking:string,reason:string){
 if(carrier.length>100||tracking.length>100||controls.test(carrier)||!/^[-A-Za-z0-9 ._/#()+]*$/.test(tracking)||!reason.trim()||reason.trim().length>500||controls.test(reason))throw new Error('Use at most 100 characters per delivery field, a reference with letters, numbers or . _ / # ( ) + -, and a reason of 1 to 500 characters. Line breaks are not allowed.');
 return {carrier_label:carrier.trim()||null,tracking_reference:tracking.trim()||null,reason:reason.trim()};
}
function optional(value:unknown,reference=false):string|null{
 if(value===null)return null;const text=adminText(value,100);
 if(controls.test(text)||(reference&&!/^[-A-Za-z0-9 ._/#()+]+$/.test(text)))throw new Error('Invalid fulfilment response.');return text;
}
export function parseFulfilmentValue(value:unknown,orderId:string):FulfilmentValue{
 const row=adminRecord(value);const version=adminInteger(row.version);
 if(row.order_id!==orderId||(version===0&&(row.updated_at!==null||row.carrier_label!==null||row.tracking_reference!==null))||(version>0&&row.updated_at===null))throw new Error('Invalid fulfilment response.');
 return {order_id:orderId,carrier_label:optional(row.carrier_label),tracking_reference:optional(row.tracking_reference,true),version,updated_at:row.updated_at===null?null:adminDate(row.updated_at)};
}
export function parseFulfilment(value:unknown,orderId:string):FulfilmentRead{
 const row=adminRecord(value);const current=parseFulfilmentValue(row.current,orderId);
 const history=parseAdminRows(row.history,value=>{const h=adminRecord(value);const version=adminInteger(h.version);if(version<1||version>current.version)throw new Error('Invalid fulfilment history.');return {operation_id:adminText(h.operation_id,100),carrier_label:optional(h.carrier_label),tracking_reference:optional(h.tracking_reference,true),reason:adminText(h.reason,500),version,created_at:adminDate(h.created_at)};},h=>h.operation_id,50);
 if(history.length!==Math.min(current.version,50)||new Set(history.map(h=>h.version)).size!==history.length||history.some((h,i)=>h.version!==current.version-i))throw new Error('Invalid fulfilment history.');
 return {current,history};
}
export function confirmFulfilment(value:unknown,orderId:string,expected:number,input:ReturnType<typeof fulfilmentInput>):FulfilmentValue{
 const saved=parseFulfilmentValue(value,orderId);if(saved.version!==expected+1||saved.carrier_label!==input.carrier_label||saved.tracking_reference!==input.tracking_reference)throw new Error('Delivery save was not confirmed.');return saved;
}
