import { adminRecord, adminText, adminDate, adminInteger } from './adminValidation';
import type { AdminErrorKind } from './adminFormBehavior';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function checkAdmin(client: SupabaseClient, token: string): Promise<boolean> {
 try {const {data,error}=await client.rpc('is_business_admin').setHeader('Authorization',`Bearer ${token}`);if(error||typeof data!=='boolean')throw new Error();return data;}
 catch {throw new Error('Administration access could not be checked.');}
}

export type AdminProduct = { id: string; name: string; description: string; category: string; image_path: string; background_color: string; display_order: number; active: boolean; updated_at: string };
export class AdminOperationError extends Error {
  constructor(public readonly kind: Exclude<AdminErrorKind,'validation'>, message:string) {super(message);this.name='AdminOperationError';}
}
export function adminErrorKind(cause:unknown, attempted:boolean):AdminErrorKind {
  return cause instanceof AdminOperationError?cause.kind:attempted?'uncertain':'validation';
}
export async function adminRpc(client: SupabaseClient, token: string, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  try {
  const { data, error } = await client.rpc(name, args).setHeader('Authorization', `Bearer ${token}`);
  if (error) throw new AdminOperationError(error.code === '42501'?'denied':error.code === '40001'?'stale':'uncertain', error.code === '42501' ? 'Administration access was denied. Reload to check your access.' : error.code === '40001' ? 'This record changed. Reload before saving.' : 'The operation could not be confirmed. Review your inputs and reload before retrying.');
  return data;
  } catch(cause) {if(cause instanceof AdminOperationError)throw cause;throw new AdminOperationError('uncertain','The operation could not be confirmed. Review your inputs and reload before retrying.');}
}
export function isAdminDenied(cause:unknown):boolean {return cause instanceof AdminOperationError&&cause.kind==='denied';}
export function adminReadFailure(cause:unknown,label:string):string {
 if(isAdminDenied(cause))return 'Administration access was denied. Private data and actions are hidden. Retry to check your current access.';
 if(cause instanceof AdminOperationError&&cause.kind==='stale')return 'This record changed. Reload and review its current state.';
 return `${label} could not be loaded or validated. Please retry.`;
}
export function parseAdminProduct(value: unknown): AdminProduct {
 const p=adminRecord(value);const image_path=adminText(p.image_path,500);
 let safeImage=/^\/images\/[A-Za-z0-9][A-Za-z0-9/_-]*\.(webp|png|jpg|jpeg|svg)$/.test(image_path)&&!image_path.includes('..');
 // Preserve the original read contract's HTTPS legacy images; this does not establish registry approval.
 try {const url=new URL(image_path);safeImage ||= url.protocol==='https:'&&!url.username&&!url.password;}catch{/* Relative path above. */}
 if(!safeImage||typeof p.background_color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(p.background_color)||typeof p.active!=='boolean')throw new Error('Invalid product response.');
 return {id:adminText(p.id,150),name:adminText(p.name,200),description:adminText(p.description,2000),category:adminText(p.category,100),image_path,background_color:p.background_color,display_order:adminInteger(p.display_order),active:p.active,updated_at:adminDate(p.updated_at)};
}
