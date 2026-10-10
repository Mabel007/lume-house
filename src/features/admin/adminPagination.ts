import { adminRecord, parseAdminRows } from './adminValidation';

export const pageSizes = [10, 50, 100] as const;
export type PageSize = typeof pageSizes[number];
export type AdminPage<T> = { items: T[]; total_count: number; page: number; page_size: PageSize };
export function parseAdminPage<T>(value: unknown, parse: (row: unknown) => T, key: (row: T) => string, page: number, size: PageSize): AdminPage<T> {
 const row = adminRecord(value);
 if (row.page !== page || row.page_size !== size || typeof row.total_count !== 'number' || !Number.isSafeInteger(row.total_count) || row.total_count < 0) throw new Error('Invalid administration page.');
 const items = parseAdminRows(row.items, parse, key, size);
 if (items.length !== Math.min(size, Math.max(0, row.total_count - page * size))) throw new Error('Inconsistent administration count.');
 return { items, total_count: row.total_count, page, page_size: size };
}
export function lastPage(count: number, size: PageSize): number { return Math.max(0, Math.ceil(count / size) - 1); }
