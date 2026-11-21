import {useId,useRef,useState} from 'react';
import type {Product} from './products';
import {ProductImage} from './ProductImage';
import './productGallery.css';

// Decorative, file-local preview: a failed original only replaces this cue.
function GalleryThumbnail({image}:{image:string}){
 const [failed,setFailed]=useState(false);
 return <span className="product-gallery-thumb" aria-hidden="true">
  {failed
   ? <span className="product-gallery-thumb-unavailable">—</span>
   : <img src={image} alt="" width={64} height={64} loading="lazy" fetchPriority="low" onError={()=>setFailed(true)} />}
 </span>;
}

export function ProductGallery({product}:{product:Product}){
 const images=product.gallery?.length?product.gallery:[product.image];
 const [selected,setSelected]=useState(images[0]);const active=images.includes(selected)?selected:images[0];
 const [generation,setGeneration]=useState(0);
 const [failedImage,setFailedImage]=useState<string|null>(null);
 const [pending,setPending]=useState(false);
 const [loading,setLoading]=useState(true);
 const activeRef=useRef(active);const generationRef=useRef(generation);const pendingRef=useRef(false);
 const figureRef=useRef<HTMLElement>(null);const retryRef=useRef<HTMLButtonElement>(null);
 const ordinalId=useId();
 const failed=failedImage===active;
 const position=images.indexOf(active)+1;
 function selectImage(image:string){
  if(image===active)return;
  activeRef.current=image;generationRef.current+=1;pendingRef.current=false;
  setSelected(image);setFailedImage(null);setGeneration(generationRef.current);setPending(false);setLoading(true);
 }
 function retry(){
  if(pendingRef.current)return;
  pendingRef.current=true;
  generationRef.current+=1;
  setPending(true);setGeneration(generationRef.current);setLoading(true);
 }
 function current(image:string,token:number){return image===activeRef.current&&token===generationRef.current;}
 function loaded(image:string,token:number){
  if(!current(image,token))return;
  const hadFocus=document.activeElement===retryRef.current;
  pendingRef.current=false;setPending(false);setFailedImage(null);setLoading(false);
  if(hadFocus)figureRef.current?.focus();
 }
 function failedToLoad(image:string,token:number){
  if(!current(image,token))return;
  pendingRef.current=false;setPending(false);setFailedImage(image);setLoading(false);
 }
 return <div className="product-gallery"><figure ref={figureRef} className="product-details-image" style={{backgroundColor:product.color}} tabIndex={-1} aria-label={`${product.name} image`} aria-busy={loading} aria-describedby={images.length>1?ordinalId:undefined}>
   <ProductImage key={`${active}:${generation}`} product={{...product,image:active}} priority onLoad={()=>loaded(active,generation)} onError={()=>failedToLoad(active,generation)}/>
   {loading&&<span className="product-gallery-loading" aria-hidden="true">Loading image…</span>}
   {images.length>1&&<figcaption id={ordinalId} className="product-gallery-ordinal">Image {position} of {images.length}</figcaption>}
  </figure>
  {images.length>1&&<div className="product-gallery-controls" role="group" aria-label={`Images of ${product.name}`}>{images.map((image,index)=><button key={image} type="button" aria-pressed={active===image} aria-label={`View image ${index+1} of ${images.length} for ${product.name}`} onClick={()=>selectImage(image)}>
    <GalleryThumbnail key={image} image={image}/>
    <span className="product-gallery-choice"><span className="product-gallery-selected-marker" aria-hidden="true">{active===image?'✓':''}</span><span>Image {index+1}{index===0?' · Primary':''}</span></span>
  </button>)}</div>}
  {failed&&<div className="product-gallery-controls"><button ref={retryRef} type="button" aria-label={pending?`Reloading image for ${product.name}`:`Reload image for ${product.name}`} aria-disabled={pending} aria-busy={pending} onClick={retry}>{pending?'Reloading image…':'Reload image'}</button></div>}
 </div>;
}
