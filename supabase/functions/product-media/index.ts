import {productMediaHandler} from '../_shared/productMediaHandler.ts';
Deno.serve(productMediaHandler({url:Deno.env.get('SUPABASE_URL')!,anonKey:Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,origins:(Deno.env.get('ALLOWED_ORIGINS')??'').split(',').map(value=>value.trim()).filter(Boolean)}));
