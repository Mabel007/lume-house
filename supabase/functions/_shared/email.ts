export type EmailItem = { product_name: string; quantity: number; unit_price_cents: number };
export type EmailOrder = {
  id: string; order_reference: string; full_name: string; customer_email: string;
  fulfilment_method: string; delivery_street_address: string | null; delivery_area: string | null;
  delivery_city: string | null; delivery_zone_label: string | null; delivery_instructions: string | null;
  pickup_location: string | null; subtotal_cents: number; delivery_fee_cents: number; total_cents: number;
  payment_provider: string; order_items: EmailItem[];
};
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
const money = (value: number) => `NLe ${new Intl.NumberFormat('en-GB', { minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(value / 100)}`;
export function renderConfirmation(order: EmailOrder) {
  const fulfilment = order.fulfilment_method === 'pickup'
    ? `Pickup: ${order.pickup_location}`
    : `Delivery: ${[order.delivery_street_address, order.delivery_area, order.delivery_city, order.delivery_zone_label].filter(Boolean).join(', ')}`;
  const provider = order.payment_provider === 'orange' ? 'Orange Money' : 'Afrimoney';
  const text = [
    'Lumé House', 'Beautiful things live here.', '', `Order received: ${order.order_reference}`,
    `Thank you, ${order.full_name}. Your order has been placed.`,
    'Payment is awaiting confirmation. This email does not confirm payment.', '',
    ...order.order_items.map(item => `${item.product_name} — ${item.quantity} × ${money(item.unit_price_cents)} = ${money(item.unit_price_cents * item.quantity)}`), '',
    `Subtotal: ${money(order.subtotal_cents)}`, `Delivery: ${money(order.delivery_fee_cents)}`, `Total: ${money(order.total_cents)}`,
    fulfilment, ...(order.delivery_instructions ? [`Delivery instructions: ${order.delivery_instructions}`] : []),
    `Selected payment method: ${provider}`, 'Payment awaiting confirmation', '', 'Lumé House · Lumley, Freetown, Sierra Leone',
  ].join('\n');
  const e = escapeHtml;
  const rows = order.order_items.map(item => `<tr><td style="padding:16px 0;border-bottom:1px solid #e6dfd2">${e(item.product_name)}<br><span style="font-size:13px;color:#666">${item.quantity} × ${money(item.unit_price_cents)}</span></td><td align="right" style="padding:16px 0;border-bottom:1px solid #e6dfd2">${money(item.quantity * item.unit_price_cents)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3efe6;color:#283b2f;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" style="max-width:600px;background:#fffdf8"><tr><td style="padding:36px 28px"><h1 style="font-family:Georgia,serif;font-size:36px;font-weight:normal;margin:0">Lumé House</h1><p style="font-size:13px;color:#786d5d">Beautiful things live here.</p><hr style="border:0;border-top:1px solid #e6dfd2;margin:28px 0"><p style="letter-spacing:2px;font-size:11px">YOUR HOME, CONSIDERED</p><h2 style="font-family:Georgia,serif;font-size:28px;font-weight:normal">Your order has been placed.</h2><p>Thank you, ${e(order.full_name)}.</p><p><strong>${e(order.order_reference)}</strong></p><p style="background:#eee8da;padding:16px">Payment is awaiting confirmation. This email does not confirm payment.</p><table width="100%" style="border-collapse:collapse">${rows}<tr><td style="padding-top:20px">Subtotal</td><td align="right" style="padding-top:20px">${money(order.subtotal_cents)}</td></tr><tr><td>Delivery</td><td align="right">${money(order.delivery_fee_cents)}</td></tr><tr><td style="padding:16px 0;font-weight:bold">Total</td><td align="right" style="font-weight:bold">${money(order.total_cents)}</td></tr></table><h3 style="font-size:16px">${order.fulfilment_method === 'pickup' ? 'Pickup' : 'Delivery'} details</h3><p>${e(fulfilment)}</p>${order.delivery_instructions ? `<p>${e(order.delivery_instructions)}</p>` : ''}<p>Selected payment method: ${provider}<br>Payment awaiting confirmation</p><hr style="border:0;border-top:1px solid #e6dfd2;margin-top:28px"><p style="font-size:12px;color:#786d5d">Lumé House · Lumley, Freetown, Sierra Leone</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: `Lumé House — ${order.order_reference} received`, html, text };
}

export async function sendResend(apiKey: string, sender: string, order: EmailOrder, request: typeof fetch = fetch) {
  const response = await request('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `lume-order-confirmation-v1-${order.id}` },
    body: JSON.stringify({ from: sender, to: [order.customer_email], ...renderConfirmation(order) }),
  });
  if (!response.ok) throw new Error(`resend_http_${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') throw new Error('resend_invalid_response');
  return data.id;
}
