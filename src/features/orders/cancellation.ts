export type CancellationRequestRecord = {order_id: string; reason: string; requested_at: string; resolved_at?: string | null; status: 'pending' | 'accepted' | 'rejected' | 'closed'; resolution: string | null};
export function parseCancellation(value: unknown): CancellationRequestRecord | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid request response.');
  const r = value as Record<string, unknown>;
  if (typeof r.order_id !== 'string' || !r.order_id.trim() || typeof r.reason !== 'string' || r.reason.length>500 || typeof r.requested_at !== 'string' || Number.isNaN(Date.parse(r.requested_at)) || !['pending','accepted','rejected','closed'].includes(String(r.status)) || !(r.resolution === null || typeof r.resolution === 'string')) throw new Error('Invalid request response.');
  if (r.resolved_at !== undefined && r.resolved_at !== null && (typeof r.resolved_at !== 'string' || Number.isNaN(Date.parse(r.resolved_at)))) throw new Error('Invalid request resolution date.');
  if (r.status === 'pending' && (r.resolved_at != null || r.resolution !== null)) throw new Error('Invalid pending request resolution.');
  if (r.status !== 'pending' && (r.resolved_at === null || r.resolution === null)) throw new Error('Missing request resolution date.');
  return {order_id:r.order_id,reason:r.reason,requested_at:r.requested_at,status:r.status as CancellationRequestRecord['status'],resolution:r.resolution,...(r.resolved_at === undefined ? {} : {resolved_at:r.resolved_at as string | null})};
}
