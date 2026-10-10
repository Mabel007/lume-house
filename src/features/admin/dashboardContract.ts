import { adminDate, adminRecord, adminText, parseAdminRows } from './adminValidation';
import { orderStates, paymentStates } from '../orders/orders';

export const operationalQueue = ['placed', 'confirmed', 'processing', 'ready_for_pickup', 'out_for_delivery'];
export type DashboardOrder = { id: string; order_reference: string; created_at: string; status: string; payment_status: string };
export type DashboardStock = { variant_id: string; product_name: string; sku: string; available_quantity: number };
export type Dashboard = { active_products: number; total_variants: number; tracked_variants: number; out_of_stock: number; unconfigured_stock: number; total_orders: number; orders_placed: number; awaiting_payment: number; by_status: Record<string, number>; recent_orders: DashboardOrder[]; stock_attention: DashboardStock[] };
function count(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid dashboard count.'); return value; }
function order(value: unknown): DashboardOrder {
 const row = adminRecord(value); const id = adminText(row.id, 36);
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !operationalQueue.includes(String(row.status)) || !paymentStates.includes(String(row.payment_status))) throw new Error('Invalid operational queue.');
 return { id, order_reference: adminText(row.order_reference, 50), created_at: adminDate(row.created_at), status: String(row.status), payment_status: String(row.payment_status) };
}
function stock(value: unknown): DashboardStock {
 const row = adminRecord(value); if (row.available_quantity !== 0) throw new Error('Invalid stock attention.');
 return { variant_id: adminText(row.variant_id, 150), product_name: adminText(row.product_name, 200), sku: adminText(row.sku, 150), available_quantity: 0 };
}
export function parseDashboard(value: unknown): Dashboard {
 const row = adminRecord(value); const statuses = adminRecord(row.by_status);
 if (Object.keys(statuses).length !== orderStates.length || Object.keys(statuses).some(status => !orderStates.includes(status))) throw new Error('Invalid dashboard statuses.');
 const by_status = Object.fromEntries(orderStates.map(status => [status, count(statuses[status])]));
 const data: Dashboard = { active_products: count(row.active_products), total_variants: count(row.total_variants), tracked_variants: count(row.tracked_variants), out_of_stock: count(row.out_of_stock), unconfigured_stock: count(row.unconfigured_stock), total_orders: count(row.total_orders), orders_placed: count(row.orders_placed), awaiting_payment: count(row.awaiting_payment), by_status,
  recent_orders: parseAdminRows(row.recent_orders, order, row => row.id, 10), stock_attention: parseAdminRows(row.stock_attention, stock, row => row.variant_id, 10) };
 if (Object.values(by_status).reduce((sum, amount) => sum + amount, 0) !== data.total_orders || by_status.placed !== data.orders_placed || data.awaiting_payment > data.total_orders || data.tracked_variants > data.total_variants || data.out_of_stock + data.unconfigured_stock > data.tracked_variants || data.stock_attention.length !== Math.min(10, data.out_of_stock) || data.recent_orders.length !== Math.min(10, operationalQueue.reduce((sum, status) => sum + by_status[status], 0))) throw new Error('Inconsistent dashboard totals.');
 return data;
}
