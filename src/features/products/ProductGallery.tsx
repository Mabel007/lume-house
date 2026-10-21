import {useState} from 'react';
import type {Product} from './products';
import {ProductImage} from './ProductImage';
import './productGallery.css';
export function ProductGallery({product}:{product:Product}){
 const images=product.gallery?.length?product.gallery:[product.image];
 const [selected,setSelected]=useState(images[0]);const active=images.includes(selected)?selected:images[0];
 const [attempt,setAttempt]=useState(0);
 const [failedImage,setFailedImage]=useState<string|null>(null);
 const failed=failedImage===active;
 function selectImage(image:string){
  if(image===active)return;
  setSelected(image);setFailedImage(null);setAttempt(0);
 }
 return <div className="product-gallery"><figure className="product-details-image" style={{backgroundColor:product.color}}><ProductImage key={`${active}:${attempt}`} product={{...product,image:active}} priority onLoad={()=>setFailedImage(null)} onError={()=>setFailedImage(active)}/></figure>
 {images.length>1&&<div className="product-gallery-controls" role="group" aria-label={`Images of ${product.name}`}>{images.map((image,index)=><button key={image} type="button" aria-pressed={active===image} aria-label={`View image ${index+1} of ${images.length} for ${product.name}`} onClick={()=>selectImage(image)}>Image {index+1}{index===0?' · Primary':''}</button>)}</div>}
 {failed&&<div className="product-gallery-controls"><button type="button" aria-label={`Reload image for ${product.name}`} onClick={()=>setAttempt(value=>value+1)}>Reload image</button></div>}
 </div>;
}
