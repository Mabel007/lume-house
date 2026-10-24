import {productMediaHandler} from '../_shared/productMediaHandler.ts';
import {allowedOrigins} from '../_shared/cors.ts';
Deno.serve(productMediaHandler({url:Deno.env.get('SUPABASE_URL')!,anonKey:Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,origins:allowedOrigins(Deno.env.get('ALLOWED_ORIGINS')??'',Deno.env.get('ALLOWED_ORIGINS_EXTRA'),Deno.env.get('SUPABASE_URL'))}));
