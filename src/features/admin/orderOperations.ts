import { orderLabel } from '../orders/orders';
// UX projection only. The database independently enforces every transition.
export function nextOperationalStatuses(status:string,fulfilment:'delivery'|'pickup'):string[]{
  if(status==='placed')return ['confirmed','cancelled'];
  if(status==='confirmed')return ['processing','cancelled'];
  if(status==='processing')return [fulfilment==='pickup'?'ready_for_pickup':'out_for_delivery'];
  if((status==='ready_for_pickup'&&fulfilment==='pickup')||(status==='out_for_delivery'&&fulfilment==='delivery'))return ['completed'];
  return [];
}

export function orderTransitionConfirmation(status:string):string{
 return `Change this order to ${orderLabel(status)}? Payment status will not change. This does not verify payment or issue a refund.${status==='cancelled'?' This releases allocated stock.':status==='completed'?' This consumes allocated stock.':''}`;
}
