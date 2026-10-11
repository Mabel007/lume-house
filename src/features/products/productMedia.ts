export type ProductMediaRef={source:'static'|'storage';path:string;position:number};
export function parseProductGallery(value:unknown):ProductMediaRef[]{
 if(!Array.isArray(value)||value.length>8)throw new Error('Invalid product gallery');
 const paths=new Set<string>();
 const rows=value.map((item:unknown)=>{
  if(!item||typeof item!=='object')throw new Error('Invalid product image');
  const row=item as Record<string,unknown>;
  if(typeof row.path!=='string'||!Number.isInteger(row.position)||Number(row.position)<0||Number(row.position)>7||!['static','storage'].includes(String(row.source)))throw new Error('Invalid product image');
  if(row.source==='static'?!/^\/images\/[A-Za-z0-9][A-Za-z0-9/_-]*\.(svg|webp|png|jpe?g)$/.test(row.path)||row.path.includes('..'):! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/.test(row.path))throw new Error('Invalid media path');
  const key=row.source+':'+row.path;if(paths.has(key))throw new Error('Duplicate product image');paths.add(key);
  return {source:row.source as ProductMediaRef['source'],path:row.path,position:row.position as number};
 }).sort((a,b)=>a.position-b.position);
 if(rows.some((row,index)=>row.position!==index))throw new Error('Invalid image ordering');return rows;
}
// Web origin is explicit: React Native must not resolve /images relative to a native bundle.
export function resolveProductMedia(image:ProductMediaRef,supabaseUrl:string,webOrigin:string):string{
 parseProductGallery([{...image,position:0}]);
 const base=new URL(image.source==='storage'?supabaseUrl:webOrigin);
 if(base.username||base.password||!(base.protocol==='https:'||base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))throw new Error('Invalid media origin');
 return image.source==='static'?new URL(image.path,base.origin).href:new URL('/functions/v1/product-media?key='+encodeURIComponent(image.path),base.origin).href;
}
export function moveGalleryImage(items:ProductMediaRef[],from:number,to:number):ProductMediaRef[]{
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=items.length||to>=items.length)throw new Error('Invalid image move');
 const next=[...items];const [item]=next.splice(from,1);next.splice(to,0,item);return next.map((row,position)=>({...row,position}));
}
