import {useEffect,useRef,useState} from 'react';
import {getSupabaseClient} from '../../lib/supabase/client';
import {adminRpc,isAdminDenied,type AdminProduct} from './adminRepository';
import {moveGalleryImage,parseProductGallery,resolveProductMedia,type ProductMediaRef} from '../products/productMedia';
import {MAX_IMAGE_BYTES} from '../../../supabase/functions/_shared/productImage';
import './productGalleryEditor.css';
type Props={product:AdminProduct;token:string;saved:()=>void;blocked:boolean;busyChanged?: (busy:boolean)=>void;accessChanged?:(denied:boolean)=>void;assets:{status:string;paths:string[]}};
function GalleryPreview({image,preview,index}:{image:ProductMediaRef;preview?:string;index:number}){
 const [failed,setFailed]=useState(false);
 const src=preview??(image.source==='static'?image.path:resolveProductMedia(image,new URL(getSupabaseClient().storage.from('product-media').getPublicUrl(image.path).data.publicUrl).origin,'https://unused.invalid'));
 return failed?<span role="status">Preview unavailable. Archived or unpublished images are not publicly served.</span>:<img className="admin-gallery-preview" src={src} alt={`Gallery image ${index+1} preview`} loading="lazy" onError={()=>setFailed(true)}/>;
}
export function ProductGalleryEditor(props:Props){return <GalleryEditorSession key={props.token} {...props}/>;}
function GalleryEditorSession({product,token,saved,blocked,busyChanged,accessChanged,assets}:Props){
 const [draft,setDraft]=useState<{token:string;items:ProductMediaRef[];stamp:string}|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [revision,setRevision]=useState(0),[staticPath,setStaticPath]=useState(''),[file,setFile]=useState<File|null>(null);
 const [previews,setPreviews]=useState<Record<string,string>>({});const objectUrls=useRef<string[]>([]);
 const mounted=useRef(false),inFlight=useRef(false),controller=useRef<AbortController|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();for(const url of objectUrls.current)URL.revokeObjectURL(url);};},[]);
 useEffect(()=>{let active=true;
  void adminRpc(getSupabaseClient(),token,'admin_product_gallery_v1',{p_product_id:product.id}).then(value=>{
   if(!value||typeof value!=='object')throw new Error();const row=value as Record<string,unknown>;
   const items=parseProductGallery(row.items);if(typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))throw new Error();
   if(active){setDraft({token,items,stamp:row.updated_at});accessChanged?.(false);}
  }).catch(cause=>{if(active){if(isAdminDenied(cause))accessChanged?.(true);setError('Gallery could not be loaded. Check access and migration readiness, then retry.');}}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[token,product.id,revision,accessChanged]);
 const current=draft?.token===token?draft:null;
 const items=current?.items??[];const disabled=busy||blocked||loading||!current;
 function replace(next:ProductMediaRef[]){if(current)setDraft({...current,items:next.map((item,position)=>({...item,position}))});}
 function add(image:Omit<ProductMediaRef,'position'>){
  if(!current)return;
  const base=current.items.length?current.items:[{source:'static' as const,path:product.image_path,position:0}];
  if(base.some(item=>item.source===image.source&&item.path===image.path)){setError('This image is already in the gallery.');return;}
  if(base.length>=8){setError('A gallery supports up to eight images.');return;}
  replace([...base,{...image,position:base.length}]);
 }
 async function operation(upload:boolean){
  if(inFlight.current||disabled)return;inFlight.current=true;setBusy(true);busyChanged?.(true);setError('');setNotice('');
  const active=()=>mounted.current;
  try{
   if(upload){
    if(!file||file.type!=='image/png'||!file.size||file.size>MAX_IMAGE_BYTES)throw new Error('Choose a PNG image up to 2 MiB.');
    controller.current=new AbortController();
    const response=await getSupabaseClient().functions.invoke('product-media',{body:file,headers:{Authorization:`Bearer ${token}`,'Content-Type':'image/png'},signal:controller.current.signal});
    if(response.error){if(response.error.context instanceof Response&&response.error.context.status===403){accessChanged?.(true);throw new Error('Administration access was denied. Reload to check your access.');}throw new Error('Upload was not confirmed. Retry upload or check service availability. An unlinked upload stays private.');}
    const image=parseProductGallery([{...response.data,position:0}])[0];if(image.source!=='storage')throw new Error('Invalid upload confirmation.');
    if(active()){const preview=URL.createObjectURL(file);objectUrls.current.push(preview);setPreviews(value=>({...value,[image.path]:preview}));add(image);setFile(null);setNotice('Upload confirmed. Save gallery to publish this image.');}
   }else{
    const result=await adminRpc(getSupabaseClient(),token,'admin_save_product_gallery_v1',{p_product_id:product.id,p_expected_updated_at:current!.stamp,p_items:items.map(({source,path})=>({source,path}))});
    if(!result||typeof result!=='object')throw new Error('Gallery save unconfirmed.');
    const confirmed=parseProductGallery((result as Record<string,unknown>).items);
    if(JSON.stringify(confirmed)!==JSON.stringify(items))throw new Error('Gallery save unconfirmed. Reload before retrying.');
    if(active())saved();
   }
  }catch(cause){if(active()){if(isAdminDenied(cause))accessChanged?.(true);setError(cause instanceof Error?cause.message:'Media operation could not be confirmed.');}}
  finally{if(active()){setBusy(false);busyChanged?.(false);inFlight.current=false;}}
 }
 return <section className="admin-gallery" aria-label="Product gallery"><h3>Gallery and uploads</h3>
  <p>The first image is primary on updated product cards and details. Without a gallery, the existing image remains the fallback. Removing an entry does not delete its stored file.</p>
  {loading&&<p role="status">Loading gallery…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <button type="button" disabled={busy} onClick={()=>{if(!items.length||window.confirm('Reload gallery and discard unsaved gallery changes?')){setLoading(true);setError('');setNotice('');setDraft(null);setFile(null);for(const url of objectUrls.current)URL.revokeObjectURL(url);objectUrls.current=[];setPreviews({});setRevision(value=>value+1);}}}>Reload gallery / Retry</button>
  {current&&!blocked&&<><ol>{items.map((image,index)=><li key={image.source+image.path}><GalleryPreview image={image} preview={previews[image.path]} index={index}/><span>{index===0?'Primary':'Image '+(index+1)}: {image.source==='static'?image.path.split('/').pop():'Uploaded PNG'}</span><div className="admin-gallery-actions"><button type="button" disabled={disabled||index===0} onClick={()=>replace(moveGalleryImage(items,index,0))}>Make primary</button><button type="button" aria-label={`Move image ${index+1} up`} disabled={disabled||index===0} onClick={()=>replace(moveGalleryImage(items,index,index-1))}>Up</button><button type="button" aria-label={`Move image ${index+1} down`} disabled={disabled||index===items.length-1} onClick={()=>replace(moveGalleryImage(items,index,index+1))}>Down</button><button type="button" aria-label={`Remove image ${index+1} from gallery`} disabled={disabled} onClick={()=>replace(items.filter((_,position)=>position!==index))}>Remove entry</button></div></li>)}</ol>
   {!items.length&&<p>No gallery yet. The legacy product image is used.</p>}
   <label>Reviewed image to add<select value={staticPath} disabled={disabled||assets.status!=='ready'} onChange={event=>setStaticPath(event.target.value)}><option value="">Choose an image</option>{assets.paths.map(path=><option value={path} key={path}>{path.split('/').pop()}</option>)}</select></label><button type="button" disabled={disabled||!staticPath||assets.status!=='ready'||items.length>=8} onClick={()=>add({source:'static',path:staticPath})}>Add reviewed image</button>
   <label>Product image file (PNG)<input key={token} type="file" accept="image/png" disabled={disabled||items.length>=8} onChange={event=>setFile(event.target.files?.[0]??null)}/></label>
   <p>Non-interlaced 8-bit RGB/RGBA PNG only, up to 2 MiB and four million pixels. Export other formats to PNG first. Upload only product photography intended for customers.</p>
   <div className="admin-gallery-actions"><button type="button" disabled={disabled||!file||items.length>=8} onClick={()=>void operation(true)}>{busy?'Working…':'Upload PNG / Retry upload'}</button><button type="button" disabled={disabled} onClick={()=>void operation(false)}>Save gallery</button></div>
  </>}
 </section>;
}
