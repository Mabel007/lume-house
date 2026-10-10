import { adminDate, adminInteger, adminRecord, adminText } from './adminValidation';
import { orderStates, paymentStates } from '../orders/orders';

export type ExportKind = 'products' | 'inventory' | 'orders';
type Cell = string | number | boolean | null;
const columns: Record<ExportKind, readonly string[]> = {
 products: ['id', 'name', 'category', 'active', 'display_order'],
 inventory: ['product_id', 'product_name', 'variant_id', 'sku', 'inventory_policy', 'on_hand', 'allocated', 'available'],
 orders: ['order_reference', 'created_at', 'status', 'payment_status', 'currency', 'total_cents'],
};
export function csvCell(value: Cell): string {
 if (value === null) return '';
 if (typeof value !== 'string') return String(value);
 // Quoting is not formula protection. Neutralize leading whitespace/control prefixes too.
 const safe = /^[\s\p{Cc}]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
 return `"${safe.replaceAll('"', '""')}"`;
}
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('Invalid export boolean.'); return value; }
function cell(row: Record<string, unknown>, key: string): Cell {
 const value = row[key];
 if (key === 'active' || key === 'available') return boolean(value);
 if (key === 'display_order' || key === 'total_cents') return adminInteger(value);
 if (key === 'on_hand' || key === 'allocated') return value === null ? null : adminInteger(value);
 if (key === 'created_at') return adminDate(value);
 const text = adminText(value, key === 'name' || key === 'product_name' ? 200 : 150);
 if ((key === 'inventory_policy' && !['tracked', 'untracked'].includes(text)) || (key === 'status' && !orderStates.includes(text)) || (key === 'payment_status' && !paymentStates.includes(text)) || (key === 'currency' && text !== 'NLE')) throw new Error('Invalid export state.');
 return text;
}
export function exportCsv(value: unknown, kind: ExportKind): { csv: string; count: number } {
 const envelope = adminRecord(value);
 if (typeof envelope.total_count !== 'number' || !Number.isInteger(envelope.total_count) || envelope.total_count < 0 || envelope.total_count > 10000 || !Array.isArray(envelope.items) || envelope.items.length !== envelope.total_count || new TextEncoder().encode(JSON.stringify(value)).length > 8388608) throw new Error('Incomplete or oversized export.');
 const keys = columns[kind];
 const seen = new Set<string>();
 const rows = envelope.items.map(value => {
  const row = adminRecord(value);
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))) throw new Error('Unexpected export fields.');
  const cells = keys.map(key => cell(row, key));
  const identity = String(row[kind === 'products' ? 'id' : kind === 'inventory' ? 'variant_id' : 'order_reference']);
  if (seen.has(identity)) throw new Error('Duplicate export record.'); seen.add(identity);
  if (kind === 'inventory' && ((row.on_hand === null) !== (row.allocated === null) || (typeof row.on_hand === 'number' && typeof row.allocated === 'number' && row.allocated > row.on_hand))) throw new Error('Invalid export balance.');
  return cells.map(csvCell).join(',');
 });
 const labels = keys.map(key => key === 'total_cents' ? 'total_minor_units' : key === 'active' ? 'visible' : key);
 return { csv: '\uFEFF' + [labels.join(','), ...rows].join('\r\n') + '\r\n', count: envelope.total_count };
}
