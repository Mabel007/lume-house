import { createClient } from '@supabase/supabase-js';
import { deliverConfirmation } from './confirmation.ts';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalize = (value: unknown) => {
  if (typeof value !== 'string') return '';
  let number = value.replace(/[\s()-]/g,'');
  if (/^00232/.test(number)) number = '+' + number.slice(2);
  else if (/^232\d{8}$/.test(number)) number = '+' + number;
  else if (/^0\d{8}$/.test(number)) number = '+232' + number.slice(1);
  else if (/^\d{8}$/.test(number)) number = '+232' + number;
  return number;
};
export function commerceHandler(mode: 'place' | 'email') {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin');
    const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,https://lume-house-delta.vercel.app').split(',').map(value=>value.trim());
    const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', Vary:'Origin',
      ...(origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods':'POST,OPTIONS' } : {}) };
    const reply = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers});
    if (origin && !allowed.includes(origin)) return reply({error:'ORIGIN_NOT_ALLOWED'},403);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (request.method !== 'POST') return reply({error:'METHOD_NOT_ALLOWED'},405);
    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer .+/i.test(authorization)) return reply({error:'AUTH_REQUIRED'},401);
    try {
      const url = Deno.env.get('SUPABASE_URL')!;
      const client = createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{ global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false} });
      const { data:{user},error:authError } = await client.auth.getUser(authorization.slice(7));
      if (authError || !user) return reply({error:'AUTH_REQUIRED'},401);
      if (Number(request.headers.get('Content-Length')) > 20000) return reply({error:'INVALID_REQUEST'},400);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 20000) return reply({error:'INVALID_REQUEST'},400);
      let body: Record<string,unknown>;
      try { const parsed: unknown=JSON.parse(raw); if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error(); body=parsed as Record<string,unknown>; }
      catch { return reply({error:'INVALID_REQUEST'},400); }
      let order: Record<string,unknown> | null = null;
      let orderId: string;
      if (mode === 'place') {
        if (typeof body.request_id !== 'string' || !uuid.test(body.request_id) || !body.checkout || typeof body.checkout !== 'object' || Array.isArray(body.checkout) || !Array.isArray(body.expected_cart) || body.expected_cart.length>100) return reply({error:'INVALID_REQUEST'},400);
        const checkout = body.checkout as Record<string,unknown>;
        // RPC validates again. No ownership/prices/fees/status taken from body.
        const clean = { full_name:checkout.full_name,email:checkout.email,contact_phone:normalize(checkout.contact_phone),payment_phone:normalize(checkout.payment_phone),
          provider:checkout.provider,fulfilment:checkout.fulfilment,zone_id:checkout.zone_id,street:checkout.street,area:checkout.area,city:checkout.city,instructions:checkout.instructions };
        if(body.cart_version!==undefined && body.cart_version!==2)return reply({error:'INVALID_REQUEST'},400);
        const result = await client.rpc(body.cart_version===2?'place_variant_order':'place_order',{p_request_id:body.request_id,p_checkout:clean,p_expected_cart:body.expected_cart});
        if (result.error) {
          const code = result.error.message;
          if (code === 'AUTH_REQUIRED') return reply({error:code},401);
          if (['CART_CHANGED','PRODUCT_UNAVAILABLE','EMPTY_CART','OUT_OF_STOCK'].includes(code)) return reply({error:code},409);
          if (['INVALID_REQUEST','INVALID_CHECKOUT','INVALID_DELIVERY_ZONE','INVALID_DELIVERY_DETAILS','ORDER_TOTAL_LIMIT','CART_LIMIT'].includes(code)) return reply({error:code},400);
          return reply({error:'ORDER_UNAVAILABLE'},503);
        }
        order = result.data; orderId = String(order?.id);
      } else {
        if (typeof body.order_id !== 'string' || !uuid.test(body.order_id)) return reply({error:'INVALID_REQUEST'},400);
        orderId = body.order_id;
        // Owner RLS authorizes this order before the privileged email-only path.
        const own = await client.from('orders').select('id').eq('id',orderId).maybeSingle();
        if (own.error || !own.data) return reply({error:'ORDER_NOT_FOUND'},404);
      }
      let emailStatus = 'queued';
      try {
        const admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
        emailStatus = await deliverConfirmation(admin,orderId);
      } catch { /* Committed order is never undone by email/config/network errors. */ }
      return reply({...(order ? {order} : {}),email_status:emailStatus});
    } catch { return reply({error:'SERVICE_UNAVAILABLE'},503); }
  };
}
