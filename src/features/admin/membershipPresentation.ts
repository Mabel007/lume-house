import type { SupabaseClient } from '@supabase/supabase-js';
import { adminRpc } from './adminRepository';
export type Membership = {user_id:string;active:boolean;created_at:string|null;updated_at:string};
export type MembershipEvent = {id:string;user_id:string;actor_user_id:string|null;active:boolean;reason:string;created_at:string};
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid membership response.');return value as Record<string,unknown>;}
function uuid(value:unknown):string{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new Error('Invalid membership identifier.');return value;}
function date(value:unknown):string{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('Invalid membership timestamp.');return value;}
export function parseMembership(value:unknown):Membership{
 const row=record(value);if(typeof row.active!=='boolean')throw new Error('Invalid membership state.');
 return {user_id:uuid(row.user_id),active:row.active,created_at:row.created_at===null?null:date(row.created_at),updated_at:date(row.updated_at)};
}
export function parseMembershipEvent(value:unknown):MembershipEvent{
 const row=record(value);if(typeof row.active!=='boolean'||typeof row.reason!=='string'||!row.reason.trim()||row.reason.length>500)throw new Error('Invalid membership event.');
 return {id:uuid(row.id),user_id:uuid(row.user_id),actor_user_id:row.actor_user_id===null?null:uuid(row.actor_user_id),active:row.active,reason:row.reason,created_at:date(row.created_at)};
}
export function canRevokeMembership(member:Membership,currentUserId:string|null):boolean{return Boolean(currentUserId)&&member.active&&member.user_id!==currentUserId;}
export function membershipFailure(cause:unknown,mutation=false):string{
 const message=cause instanceof Error?cause.message:'';
 if(message.startsWith('Administration access was denied.'))return 'Administration access was denied. Membership data and actions are hidden. Reload to check your current access.';
 if(message.startsWith('This record changed.'))return 'This membership changed. Reload and review its current state before retrying.';
 return mutation?'Revocation could not be confirmed. Reload and review membership history before retrying.':'Memberships and history could not be loaded or validated. Reload to retry.';
}
// A UI safeguard only: the existing guarded RPC still enforces genuine identity and permissions.
export async function revokeMembership(client:SupabaseClient,token:string,member:Membership,currentUserId:string|null,reason:string):Promise<void>{
 if(!canRevokeMembership(member,currentUserId))throw new Error('This membership cannot be revoked from the current account.');
 const trimmed=reason.trim();if(!trimmed||trimmed.length>500)throw new Error('Enter a revocation reason of 1 to 500 characters.');
 const result=await adminRpc(client,token,'admin_revoke_membership',{p_user_id:member.user_id,p_expected_updated_at:member.updated_at,p_reason:trimmed});
 if(result!==null)throw new Error('Revocation could not be confirmed. Reload and review membership history before retrying.');
}
