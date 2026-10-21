import {useRef,useState} from 'react';
import type {Product} from './products';
import {ProductImage} from './ProductImage';
import './productGallery.css';
export function ProductGallery({product}:{product:Product}){
 const images=product.gallery?.length?product.gallery:[product.image];
 const [selected,setSelected]=useState(images[0]);const active=images.includes(selected)?selected:images[0];
 const [generation,setGeneration]=useState(0);
 const [failedImage,setFailedImage]=useState<string|null>(null);
 const [pending,setPending]=useState(false);
 const activeRef=useRef(active);const generationRef=useRef(generation);const pendingRef=useRef(false);
 const figureRef=useRef<HTMLElement>(null);const retryRef=useRef<HTMLButtonElement>(null);
 const failed=failedImage===active;
 function selectImage(image:string){
  if(image===active)return;
  activeRef.current=image;generationRef.current+=1;pendingRef.current=false;
  setSelected(image);setFailedImage(null);setGeneration(generationRef.current);setPending(false);
 }
 function retry(){
  if(pendingRef.current)return;
  pendingRef.current=true;
  generationRef.current+=1;
  setPending(true);setGeneration(generationRef.current);
 }
 function current(image:string,token:number){return image===activeRef.current&&token===generationRef.current;}
 function loaded(image:string,token:number){
  if(!current(image,token))return;
  const hadFocus=document.activeElement===retryRef.current;
  pendingRef.current=false;setPending(false);setFailedImage(null);
  if(hadFocus)figureRef.current?.focus();
 }
 function failedToLoad(image:string,token:number){
  if(!current(image,token))return;
  pendingRef.current=false;setPending(false);setFailedImage(image);
 }
 return <div className="product-gallery"><figure ref={figureRef} className="product-details-image" style={{backgroundColor:product.color}} tabIndex={-1} aria-label={`${product.name} image`}><ProductImage key={`${active}:${generation}`} product={{...product,image:active}} priority onLoad={()=>loaded(active,generation)} onError={()=>failedToLoad(active,generation)}/></figure>
 {images.length>1&&<div className="product-gallery-controls" role="group" aria-label={`Images of ${product.name}`}>{images.map((image,index)=><button key={image} type="button" aria-pressed={active===image} aria-label={`View image ${index+1} of ${images.length} for ${product.name}`} onClick={()=>selectImage(image)}>Image {index+1}{index===0?' · Primary':''}</button>)}</div>}
 {failed&&<div className="product-gallery-controls"><button ref={retryRef} type="button" aria-label={pending?`Reloading image for ${product.name}`:`Reload image for ${product.name}`} aria-disabled={pending} aria-busy={pending} onClick={retry}>{pending?'Reloading image…':'Reload image'}</button></div>}
 </div>;
}
