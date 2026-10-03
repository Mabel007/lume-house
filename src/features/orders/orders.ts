export type OrderListItem = {
  id: string; order_reference: string; created_at: string; total_cents: number;
  currency: 'NLE'; fulfilment_method: 'delivery' | 'pickup'; status: string; payment_status: string;
};
export type OrderItem = { product_name: string; quantity: number; unit_price_cents: number };
export type Order = OrderListItem & {
  full_name: string; customer_email: string; customer_phone: string;
  delivery_street_address: string | null; delivery_area: string | null; delivery_city: string | null;
  delivery_zone_label: string | null; delivery_instructions: string | null; pickup_location: string | null;
  payment_provider: 'orange' | 'afri'; payment_phone_last4: string | null;
  subtotal_cents: number; delivery_fee_cents: number; order_items: OrderItem[];
};
export const orderStates = ['placed','confirmed','processing','ready_for_pickup','out_for_delivery','completed','cancelled'];
export const paymentStates = ['pending','awaiting_payment','paid','failed'];
export const orderLabel = (value: string) => value === 'awaiting_payment' ? 'Awaiting confirmation' : value.replaceAll('_',' ');
function row(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid order data.');
  return value as Record<string,unknown>;
}
function text(value: unknown) { if (typeof value !== 'string' || !value.length) throw new Error('Invalid order data.'); return value; }
function money(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number)>2147483647) throw new Error('Invalid order data.'); return value as number; }
function nullable(value: unknown) { return value === null ? null : text(value); }
export function parseOrderList(value: unknown): OrderListItem {
  const r = row(value);
  const id = text(r.id); const reference = text(r.order_reference); const date = text(r.created_at);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^LH-[A-F0-9]{16}$/.test(reference) || Number.isNaN(Date.parse(date)) || r.currency !== 'NLE' || !['delivery','pickup'].includes(String(r.fulfilment_method)) || !orderStates.includes(String(r.status)) || !paymentStates.includes(String(r.payment_status))) throw new Error('Invalid order data.');
  return { id, order_reference:reference, created_at:date, total_cents:money(r.total_cents), currency:'NLE', fulfilment_method:r.fulfilment_method as 'delivery'|'pickup', status:String(r.status), payment_status:String(r.payment_status) };
}
export function parseOrder(value: unknown): Order {
  const r = row(value); const base = parseOrderList(r);
  if (!Array.isArray(r.order_items) || !r.order_items.length || !['orange','afri'].includes(String(r.payment_provider))) throw new Error('Invalid order data.');
  const order_items = r.order_items.map(value => {
    const item = row(value);
    if (!Number.isInteger(item.quantity) || (item.quantity as number)<1 || (item.quantity as number)>99) throw new Error('Invalid order data.');
    return { product_name:text(item.product_name), quantity:item.quantity as number, unit_price_cents:money(item.unit_price_cents) };
  });
  const subtotal = money(r.subtotal_cents); const fee = money(r.delivery_fee_cents);
  if (subtotal + fee !== base.total_cents || order_items.reduce((sum,item)=>sum+item.quantity*item.unit_price_cents,0)!==subtotal) throw new Error('Invalid order totals.');
  return { ...base, full_name:text(r.full_name), customer_email:text(r.customer_email), customer_phone:text(r.customer_phone),
    delivery_street_address:nullable(r.delivery_street_address), delivery_area:nullable(r.delivery_area), delivery_city:nullable(r.delivery_city),
    delivery_zone_label:nullable(r.delivery_zone_label), delivery_instructions:nullable(r.delivery_instructions), pickup_location:nullable(r.pickup_location),
    payment_provider:r.payment_provider as 'orange'|'afri', payment_phone_last4:nullable(r.payment_phone_last4), subtotal_cents:subtotal, delivery_fee_cents:fee, order_items };
}
export type CheckoutInput = { full_name:string; email:string; contact_phone:string; payment_phone:string; provider:'orange'|'afri'; fulfilment:'delivery'|'pickup'; zone_id:string; street:string; area:string; city:string; instructions:string };
