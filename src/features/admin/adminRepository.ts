import type { SupabaseClient } from '@supabase/supabase-js';

export async function checkAdmin(client: SupabaseClient, token: string): Promise<boolean> {
  const { data, error } = await client.rpc('is_business_admin').setHeader('Authorization', `Bearer ${token}`);
  if (error || typeof data !== 'boolean') throw new Error('Administration access could not be checked.');
  return data;
}
