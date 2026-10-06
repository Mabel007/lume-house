export type CancellationRequestRecord = {order_id: string; reason: string; requested_at: string; status: 'pending' | 'accepted' | 'rejected' | 'closed'; resolution: string | null};
export function parseCancellation(value: unknown): CancellationRequestRecord | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('Invalid request response.');
  const r = value as Record<string, unknown>;
  if (typeof r.order_id !== 'string' || typeof r.reason !== 'string' || typeof r.requested_at !== 'string' || !['pending','accepted','rejected','closed'].includes(String(r.status)) || !(r.resolution === null || typeof r.resolution === 'string')) throw new Error('Invalid request response.');
  return r as CancellationRequestRecord;
}
