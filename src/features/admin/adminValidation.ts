// Project only supported fields; never carry unused private response data into UI state.
export function adminRecord(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid administration response.');
 return value as Record<string,unknown>;
}
export function adminText(value:unknown,max:number):string {
 if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error('Invalid administration text.');
 return value;
}
export function adminDate(value:unknown):string {
 const date=adminText(value,100);if(!Number.isFinite(Date.parse(date)))throw new Error('Invalid administration date.');return date;
}
export function adminInteger(value:unknown):number {
 if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>2147483647)throw new Error('Invalid administration quantity.');return value;
}
export function parseAdminRows<T>(value:unknown,parse:(row:unknown)=>T,key:(row:T)=>string,maximum?:number):T[] {
 if(!Array.isArray(value)||(maximum!==undefined&&value.length>maximum))throw new Error('Invalid administration list.');
 const ids=new Set<string>();return value.map(value=>{const row=parse(value);const id=key(row);if(ids.has(id))throw new Error('Duplicate administration record.');ids.add(id);return row;});
}
