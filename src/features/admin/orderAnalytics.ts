import {adminRecord,adminInteger,adminDate} from './adminValidation';
import {orderStates} from '../orders/orders';
export type OrderAnalytics={from:string;to:string;total:number;awaiting:number;statuses:Record<string,number>;pickup:number;delivery:number;series:{date:string;orders:number}[]};
export function parseOrderAnalytics(value:unknown,from:string,to:string):OrderAnalytics{
 const data=adminRecord(value),actualFrom=adminDate(data.from),actualTo=adminDate(data.to),total=adminInteger(data.total_orders),awaiting=adminInteger(data.awaiting_payment);
 if(Date.parse(actualFrom)!==Date.parse(from)||Date.parse(actualTo)!==Date.parse(to)||awaiting>total||!Array.isArray(data.series)||data.series.length>367)throw new Error('Invalid analytics envelope.');
 const breakdown=adminRecord(data.by_status),statuses=Object.fromEntries(orderStates.map(status=>[status,adminInteger(breakdown[status])])),fulfilment=adminRecord(data.by_fulfilment),pickup=adminInteger(fulfilment.pickup),delivery=adminInteger(fulfilment.delivery);
 const first=new Date(from).toISOString().slice(0,10),last=new Date(Date.parse(to)-1).toISOString().slice(0,10);const expected=(Date.parse(`${last}T00:00Z`)-Date.parse(`${first}T00:00Z`))/86400000+1;
 if(data.series.length!==expected||Object.values(statuses).reduce((a,b)=>a+b,0)!==total||pickup+delivery!==total)throw new Error('Inconsistent analytics totals.');
 const series=data.series.map((item,index)=>{const row=adminRecord(item);const date=new Date(Date.parse(`${first}T00:00Z`)+index*86400000).toISOString().slice(0,10);if(row.date!==date)throw new Error('Invalid UTC bucket sequence.');return {date,orders:adminInteger(row.orders)};});
 if(series.reduce((sum,row)=>sum+row.orders,0)!==total)throw new Error('Inconsistent daily totals.');
 return {from:actualFrom,to:actualTo,total,awaiting,statuses,pickup,delivery,series};
}
