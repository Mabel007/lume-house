import {createClient} from '@supabase/supabase-js';
import {boundedImageBody, validateProductPng} from './productImage.ts';
type MediaConfig={url:string;anonKey:string;serviceKey:string;origins:string[]};
const objectKey=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;
export function productMediaHandler(config:MediaConfig, factory:typeof createClient=createClient) {
 return async(request:Request):Promise<Response>=>{
  const origin=request.headers.get('origin');
  const headers={'Cache-Control':'no-store',Vary:'Origin',...(origin&&config.origins.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}:{})};
  const reply=(error:string,status:number)=>new Response(JSON.stringify({error}),{status,headers:{...headers,'Content-Type':'application/json'}});
  if(origin&&!config.origins.includes(origin))return reply('ORIGIN_NOT_ALLOWED',403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','POST'].includes(request.method))return reply('METHOD_NOT_ALLOWED',405);
  try {
   const opts={auth:{persistSession:false,autoRefreshToken:false}};
   if(request.method==='GET'){
    const key=new URL(request.url).searchParams.get('key');if(!key||!objectKey.test(key))return reply('NOT_FOUND',404);
    const publicClient=factory(config.url,config.anonKey,opts);
    const visible=await publicClient.rpc('catalogue_media_visible_v1',{p_path:key});
    if(visible.error)return reply('MEDIA_UNAVAILABLE',503);
    if(visible.data!==true)return reply('NOT_FOUND',404);
    const privileged=factory(config.url,config.serviceKey,opts);
    const download=await privileged.storage.from('product-media').download(key);
    if(download.error||!download.data)return reply('MEDIA_UNAVAILABLE',503);
    return new Response(download.data,{headers:{...headers,'Content-Type':'image/png','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
   }
   const authorization=request.headers.get('authorization')??'';
   if(!/^Bearer .+/i.test(authorization))return reply('AUTH_REQUIRED',401);
   const caller=factory(config.url,config.anonKey,{...opts,global:{headers:{Authorization:authorization}}});
   const identity=await caller.auth.getUser(authorization.slice(7));
   if(identity.error||!identity.data.user)return reply('AUTH_REQUIRED',401);
   const access=await caller.rpc('is_business_admin');if(access.error||access.data!==true)return reply('ADMIN_REQUIRED',403);
   let image:Awaited<ReturnType<typeof validateProductPng>>;
   try {image=await validateProductPng(await boundedImageBody(request),request.headers.get('content-type')??'');}
   catch{return reply('INVALID_IMAGE',400);}
   // Recheck membership after potentially expensive validation; attaching later checks again under a row lock.
   const current=await caller.rpc('is_business_admin');if(current.error||current.data!==true)return reply('ADMIN_REQUIRED',403);
   const key=crypto.randomUUID()+'.png',privileged=factory(config.url,config.serviceKey,opts);
   const upload=await privileged.storage.from('product-media').upload(key,image.bytes,{contentType:'image/png',upsert:false});
   if(upload.error)return reply('UPLOAD_UNAVAILABLE',503);
   const registry=await privileged.rpc('register_product_image_v1',{p_path:key,p_width:image.width,p_height:image.height,p_bytes:image.bytes.length});
   // Fail closed: failed registration leaves private, unreferenced bytes, never public media.
   if(registry.error)return reply('UPLOAD_UNCONFIRMED',503);
   return new Response(JSON.stringify({source:'storage',path:key}),{status:201,headers:{...headers,'Content-Type':'application/json'}});
  }catch{return reply('MEDIA_UNAVAILABLE',503);}
 };
}
