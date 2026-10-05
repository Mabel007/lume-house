import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProducts } from './ProductContext';
import { ProductStatus } from './ProductStatus';
import { ProductImage } from './ProductImage';
import type { Product } from './products';
import { canUseLegacyBag, requiresOptions, variantLabel } from './variants';
import { useCart } from '../cart/CartContext';
import { MAX_QUANTITY } from '../cart/cart';
import { formatMoney } from '../../config/shop';

export function ProductDetailsPage() {
  const { productId }=useParams();
  const { state }=useProducts();
  if(state.status!=='ready') return <section className="wrap page-section"><h1>Product details.</h1><ProductStatus /></section>;
  const product=state.products.find(product=>product.id===productId);
  if(!product)return <section className="wrap page-section empty-state"><h1>This piece is unavailable.</h1><p>It may no longer be part of the active collection.</p><Link className="button" to="/">Explore the collection</Link></section>;
  return <ProductDetails key={product.id} product={product} />;
}

export function ProductDetails({product}:{product:Product}) {
  const {items,dispatch,status}=useCart();
  const [selection,setSelection]=useState('');
  const [notice,setNotice]=useState('');
  const optionsRequired=requiresOptions(product.variants);
  const choices=product.variants?.filter(variant=>!variant.isDefault)??[];
  const variant=optionsRequired ? choices.find(variant=>variant.id===selection) : product.variants?.find(variant=>variant.isDefault);
  // Until the variant checkout slice, only a compatible simple default may use
  // the legacy product-only Bag. Never silently purchase arbitrary options.
  const compatible=canUseLegacyBag(product);
  const quantity=items.find(item=>item.productId===product.id)?.quantity??0;
  const busy=['loading','saving','error','checking-out'].includes(status??'');
  const price=variant?.price??product.price;
  return <section className="wrap page-section product-details">
    <Link className="back-link" to="/">← Back to the collection</Link>
    <div className="product-details-grid"><figure className="product-details-image" style={{backgroundColor:product.color}}><ProductImage product={product}/></figure>
      <div className="product-details-copy"><p className="eyebrow">{product.category}</p><h1>{product.name}</h1><p className="product-details-price">{formatMoney(price)}</p><p className="product-details-description">{product.description}</p>
        {optionsRequired && <fieldset className="variant-options"><legend>Choose your options</legend>{choices.map(choice=><label key={choice.id}><input type="radio" name={`variant-${product.id}`} value={choice.id} checked={selection===choice.id} onChange={()=>setSelection(choice.id)}/><span>{variantLabel(choice)}<span className="variant-option-price">{formatMoney(choice.price)}</span></span></label>)}</fieldset>}
        <p className="small-note">{compatible?'Available to add to your Bag.':optionsRequired ? variant?'Selected options are not available for checkout yet.':'Choose an available combination.':'This piece is currently unavailable.'}</p>
        <button className="button product-details-add" disabled={!compatible||busy||quantity>=MAX_QUANTITY} aria-label={`Add ${product.name} to Bag`} onClick={()=>{dispatch({type:'add',productId:product.id});setNotice(`${product.name}: Bag update requested.`);}}>{quantity>=MAX_QUANTITY?'Quantity limit reached':'Add to Bag'}</button>
        <p role="status" className="feedback">{notice}</p><Link className="text-link" to="/cart">View your Bag →</Link><p className="small-note">Payment awaits confirmation after order placement.</p>
      </div>
    </div>
  </section>;
}
