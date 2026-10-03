import type { SupabaseClient } from '@supabase/supabase-js';
import { sendResend, type EmailOrder } from './email.ts';
export async function deliverConfirmation(admin: SupabaseClient, orderId: string): Promise<string> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return 'queued'; // No claim/send attempt without server configuration.
  const sender = Deno.env.get('RESEND_FROM') || 'LumÃ© House <onboarding@resend.dev>';
  const claim = await admin.rpc('claim_order_confirmation', { p_order_id: orderId, p_sender: sender });
  if (claim.error) return 'queued';
  if (!claim.data) {
    const job = await admin.from('order_confirmation_jobs').select('status,last_error_code').eq('order_id',orderId).maybeSingle();
    return job.data?.status === 'sent' ? 'sent' : job.data?.last_error_code === 'manual_reconciliation_required' ? 'review_required' : 'queued';
  }
  const token = claim.data.claim_token;
  let providerId: string | null = null;
  let errorCode: string | null = null;
  try {
    const loaded = await admin.from('orders').select('id,order_reference,full_name,customer_email,fulfilment_method,delivery_street_address,delivery_area,delivery_city,delivery_zone_label,delivery_instructions,pickup_location,subtotal_cents,delivery_fee_cents,total_cents,payment_provider,order_items(product_name,quantity,unit_price_cents)').eq('id',orderId).single();
    if (loaded.error) throw new Error('order_snapshot_unavailable');
    loaded.data.order_items.sort((a,b) => a.product_name.localeCompare(b.product_name));
    providerId = await sendResend(apiKey, claim.data.sender, loaded.data as EmailOrder);
  } catch (error) {
    // Store only a constrained operational code, never raw errors/PII/keys.
    errorCode = error instanceof Error && /^resend_http_\d{3}$/.test(error.message) ? error.message : 'send_failed';
  }
  const finished = await admin.rpc('finish_order_confirmation', { p_order_id: orderId, p_claim_token: token, p_provider_id: providerId, p_error_code: errorCode });
  return finished.error || !finished.data ? 'queued' : providerId ? 'sent' : 'queued';
}

