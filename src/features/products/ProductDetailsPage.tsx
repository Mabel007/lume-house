import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProducts } from './ProductContext';
import { ProductStatus } from './ProductStatus';
import { ProductGallery } from './ProductGallery';
import type { Product } from './products';
import { requiresOptions, variantLabel, variantAvailable, cataloguePrice } from './variants';
import { useCart } from '../cart/CartContext';
import { defaultVariant, MAX_QUANTITY } from '../cart/cart';
import { bagAddedText, bagAddFailedText } from '../cart/bagFeedback';
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
  const [notice,setNotice]=useState<{tone:'success'|'failure';text:string}|null>(null);
  const [amount,setAmount]=useState(1);
  const [pending,setPending]=useState(false);
  const optionsRequired=requiresOptions(product.variants);
  const choices=product.variants?.filter(variant=>!variant.isDefault)??[];
  const variant=optionsRequired ? choices.find(variant=>variant.id===selection) : defaultVariant(product);
  const compatible=variantAvailable(variant);
  const quantity=items.find(item=>item.variantId===variant?.id || !item.variantId && item.productId===product.id)?.quantity??0;
  const busy=['loading','saving','error','checking-out'].includes(status??'');
  const price=variant?.price??cataloguePrice(product).price;
  async function addToBag() {
    if(!variant)return;
    const name=product.name;const detail=variantLabel(variant);const addedAmount=amount;
    setPending(true);
    const outcome=await dispatch({type:'add',productId:product.id,variantId:variant.id,quantity:addedAmount});
    setPending(false);
    if(outcome.kind==='confirmed')setNotice({tone:'success',text:bagAddedText(addedAmount,name,detail)});
    else if(outcome.kind==='rejected')setNotice({tone:'failure',text:bagAddFailedText(name)});
  }
  return <section className="wrap page-section product-details">
    <Link className="back-link" to="/">← Back to the collection</Link>
    <div className="product-details-grid"><ProductGallery product={product}/>
      <div className="product-details-copy"><p className="eyebrow">{product.category}</p><h1>{product.name}</h1><p className="product-details-price">{!variant&&optionsRequired?'From ':''}{formatMoney(price)}</p><p className="product-details-description">{product.description}</p>
        {optionsRequired && <fieldset className="variant-options"><legend>Choose your options</legend>{choices.map(choice=><label key={choice.id}><input type="radio" name={`variant-${product.id}`} value={choice.id} disabled={!variantAvailable(choice)} checked={selection===choice.id} onChange={()=>setSelection(choice.id)}/><span>{variantLabel(choice)}{!variantAvailable(choice)&&' — Unavailable'}<span className="variant-option-price">{formatMoney(choice.price)}</span></span></label>)}</fieldset>}
        <p className="small-note">{compatible?'Available to add to your Bag.':optionsRequired && !variant ? 'Choose an available combination.':'This piece is currently unavailable.'}</p>
        <div className="form-grid product-quantity"><div><label htmlFor="product-quantity">Quantity</label><input id="product-quantity" type="number" min={1} max={MAX_QUANTITY} step={1} value={amount} onChange={event=>{const value=event.target.valueAsNumber;if(Number.isInteger(value)&&value>=1&&value<=MAX_QUANTITY)setAmount(value);}} /></div></div>
        <button className="button product-details-add" disabled={!compatible||busy||pending||quantity+amount>MAX_QUANTITY} aria-label={`Add ${product.name} to Bag`} onClick={addToBag}>{pending?'Adding…':quantity+amount>MAX_QUANTITY?'Quantity limit reached':'Add to Bag'}</button>
        <p role="status" aria-live="polite" className={`feedback${notice?.tone==='failure'?' feedback-failure':''}`}>{notice?.text??''}</p><Link className="text-link" to="/cart">View your Bag →</Link><p className="small-note">Payment awaits confirmation after order placement.</p>
      </div>
    </div>
  </section>;
}
