import type { SupabaseClient } from '@supabase/supabase-js';
import { adminRpc, parseAdminProduct, type AdminProduct } from './adminRepository';

export function categorySuggestions(products: readonly Pick<AdminProduct, 'category'>[]) {
  return [...new Set(products.map(product => product.category).filter(value => value.trim()))]
    .map(value => ({value,label:value.trim().replace(/\s+/g,' ')}))
    .sort((a,b)=>a.label.localeCompare(b.label));
}
export function isLocalProductImage(path: string): boolean {
  return path.length <= 500 && /^\/images\/[A-Za-z0-9][A-Za-z0-9/_-]*\.(webp|png|jpg|jpeg|svg)$/.test(path) && !path.includes('..');
}
export type ProductSaveResult = {product: AdminProduct; kind: 'created' | 'updated'};
export async function confirmedProductSave(client: SupabaseClient, token: string, kind: ProductSaveResult['kind'], args: Record<string, unknown>): Promise<ProductSaveResult> {
  const product = parseAdminProduct(await adminRpc(client,token,kind === 'created' ? 'admin_create_product' : 'admin_save_product',args));
  if (!product.id || !product.name.trim() || Number.isNaN(Date.parse(product.updated_at)) || (kind === 'updated' && product.id !== args.p_id)) throw new Error('Save could not be confirmed. Review the catalogue before retrying.');
  return {product,kind};
}
export function productSaveMessage(result: ProductSaveResult): string {
  return `Product saved successfully. ${result.kind === 'created' ? 'Creation' : 'Update'} confirmed: ${result.product.name}.`;
}
