import type { SupabaseClient } from '@supabase/supabase-js';

export async function checkAdmin(client: SupabaseClient, token: string): Promise<boolean> {
  const { data, error } = await client.rpc('is_business_admin').setHeader('Authorization', `Bearer ${token}`);
  if (error || typeof data !== 'boolean') throw new Error('Administration access could not be checked.');
  return data;
}

export type AdminProduct = { id: string; name: string; description: string; category: string; image_path: string; background_color: string; display_order: number; active: boolean; updated_at: string };
export async function adminRpc(client: SupabaseClient, token: string, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await client.rpc(name, args).setHeader('Authorization', `Bearer ${token}`);
  if (error) throw new Error(error.code === '42501' ? 'Administration access was denied. Reload to check your access.' : error.code === '40001' ? 'This record changed. Reload before saving.' : 'The operation could not be confirmed. Review your inputs and reload before retrying.');
  return data;
}
export function parseAdminProduct(value: unknown): AdminProduct {
  if (!value || typeof value !== 'object') throw new Error('Invalid product response.');
  const p = value as Record<string, unknown>;
  for (const key of ['id','name','description','category','image_path','background_color','updated_at']) if (typeof p[key] !== 'string') throw new Error('Invalid product response.');
  if (typeof p.active !== 'boolean' || !Number.isInteger(p.display_order)) throw new Error('Invalid product response.');
  return p as AdminProduct;
}
