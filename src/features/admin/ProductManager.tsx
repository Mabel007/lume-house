import {AdminReadState} from './AdminReadState';
import {parseAdminRows} from './adminValidation';
import { AdminForm } from './AdminForm';
import { useAdminReturnFocus, type AdminErrorKind } from './adminFormBehavior';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { adminRpc, adminErrorKind, adminReadFailure, parseAdminProduct, type AdminProduct } from './adminRepository';
import { ProductMedia } from './ProductMedia';
import { ReviewedMediaPicker } from './ReviewedMediaPicker';
import { canSaveReviewedImage, useReviewedAssets, type ImagePreview } from './reviewedMedia';
import { VariantManager } from './VariantManager';
import {majorToMinor,majorPricePattern} from './priceInput';
import {categorySuggestions,confirmedProductSave,isLocalProductImage,productSaveMessage,type ProductSaveResult} from './productEditorModel';

export function ProductCategory({value,categories}:{value:string;categories:ReturnType<typeof categorySuggestions>}) {
  const [category,setCategory]=useState(value);
  return <><label>Category<input name="category" required maxLength={100} list="product-category-options" aria-describedby="product-category-help" value={category} onChange={event=>setCategory(event.target.value)}/></label><datalist id="product-category-options">{categories.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</datalist><p id="product-category-help" className="admin-field-help">{!categories.length ? 'No existing categories in the loaded catalogue. Enter a category name.' : category.trim() && !categories.some(item=>item.value === category) ? 'This is a new category in the loaded catalogue; it will be saved with this product.' : 'Choose an existing category, or type a new one.'} Suggestions cover the loaded products only.</p></>;
}
export function ProductImagePreview({path}:{path:string}) {
  const [broken,setBroken]=useState(false);
  if(!isLocalProductImage(path))return <p className="admin-field-help">Use a reviewed local file under /images/. External image URLs are not supported.</p>;
  return broken ? <p role="status">Image preview unavailable. Check the reviewed file path.</p> : <img className="admin-editor-preview" src={path} alt="Product image preview" onError={()=>setBroken(true)}/>;
}

export function ProductEditor({ product, token, saved, busyChanged, cancel, categories=[],blocked=false,accessChanged }: { product: AdminProduct | null; token: string; saved: (result:ProductSaveResult) => void; busyChanged?: (busy: boolean) => void; cancel?:()=>void; categories?:ReturnType<typeof categorySuggestions>;blocked?:boolean;accessChanged?:(denied:boolean)=>void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');const [errorKind,setErrorKind]=useState<AdminErrorKind>('validation');
  const creation = useRef<{id: string; signature: string} | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting=useRef(false);const [imagePath,setImagePath]=useState(product?.image_path ?? '/images/mug.svg');
  const {assets,reload}=useReviewedAssets(token,accessChanged);const [preview,setPreview]=useState<ImagePreview>({path:imagePath,status:'loading'});
  useEffect(() => { heading.current?.focus(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(submitting.current||blocked)return;submitting.current=true; const form = new FormData(event.currentTarget); setBusy(true); busyChanged?.(true); setError('');
    let attempted=false;
    try { const args = {
      p_id: product?.id ?? null, p_expected_updated_at: product?.updated_at ?? null,
      p_name: form.get('name'), p_description: form.get('description'), p_category: form.get('category'),
      p_image_path: form.get('image_path'), p_background_color: form.get('background_color'),
      p_display_order: Number(form.get('display_order')), p_active: form.get('active') === 'on',
      p_initial_price: product ? null : majorToMinor(String(form.get('initial_price') ?? '')),
    };
      if(!canSaveReviewedImage(assets,imagePath,preview) || args.p_image_path!==imagePath)throw new Error('Choose a reviewed image with a working preview before saving.');
      if(!String(args.p_category ?? '').trim() || String(args.p_category).trim().length>100)throw new Error('Enter a category name of 1 to 100 characters.');
      if (!product) {
        const request = {p_name: args.p_name, p_description: args.p_description, p_category: args.p_category, p_image_path: args.p_image_path, p_background_color: args.p_background_color, p_display_order: args.p_display_order, p_active: args.p_active, p_initial_price: args.p_initial_price};
        const signature = JSON.stringify(request);
        if (creation.current && creation.current.signature !== signature) throw new Error('Retry the original creation unchanged, or deliberately start a new creation.');
        creation.current ??= {id: crypto.randomUUID(), signature};
        attempted=true;saved(await confirmedProductSave(getSupabaseClient(), token, 'created', {...request, p_operation_id: creation.current.id}));
      } else {attempted=true;saved(await confirmedProductSave(getSupabaseClient(), token, 'updated', args));}
      } catch (cause) { setErrorKind(adminErrorKind(cause,attempted||Boolean(creation.current)));setError(cause instanceof Error ? cause.message : 'Save failed.'); }
    finally { submitting.current=false;setBusy(false); busyChanged?.(false); }
  }
  return <>{blocked&&assets.status==='error'&&<AdminReadState message={assets.message} retry={reload} retryLabel="Reload media" disabled={busy}/>}<AdminForm hidden={blocked} blocked={blocked} className="admin-form" onSubmit={submit} busy={busy} error={error} errorKind={errorKind}><h3 ref={heading} tabIndex={-1}>{product ? `Edit ${product.name}` : 'Create product'}</h3>
    <p className="admin-field-help">Save product applies only this form; variant and reviewed-image changes have separate saves.</p>
    <fieldset className="admin-editor-section" disabled={busy}><legend>Product Information</legend>
    <label>Name<input name="name" required maxLength={200} defaultValue={product?.name ?? ''} /></label>
    <label>Description<textarea name="description" required maxLength={2000} defaultValue={product?.description ?? ''} /></label>
    <ProductCategory value={product?.category ?? ''} categories={categories}/></fieldset>
    <fieldset className="admin-editor-section" disabled={busy}><legend>Media &amp; Appearance</legend>
    <input type="hidden" name="image_path" value={imagePath}/>
    <ReviewedMediaPicker assets={assets} value={imagePath} change={path=>{setImagePath(path);setPreview({path,status:'loading'});}} preview={preview} previewChanged={setPreview} reload={()=>{setPreview({path:imagePath,status:'loading'});reload();}} disabled={busy}/>
    <p className="admin-field-help">Save Product includes this image selection. The separate reviewed-image section saves only its own selection.</p>
    <label>Background colour (hex)<input name="background_color" required pattern="#[0-9a-fA-F]{6}" defaultValue={product?.background_color ?? '#e9e3d8'} aria-describedby="product-colour-help" /></label><p id="product-colour-help" className="admin-field-help">Six-digit colour, for example #e9e3d8.</p>
    <label>Display order<input name="display_order" type="number" required min="0" step="1" defaultValue={product?.display_order ?? 0} aria-describedby="product-order-help" /></label><p id="product-order-help" className="admin-field-help">A nonnegative whole number controls catalogue ordering.</p></fieldset>
    <fieldset className="admin-editor-section" disabled={busy}><legend>Pricing &amp; Availability</legend>
    {!product ? <label>Initial default variant price (NLe)<input name="initial_price" type="text" inputMode="decimal" required maxLength={14} pattern={majorPricePattern} aria-describedby="product-price-help" /><span id="product-price-help" className="admin-field-help">Enter NLe, for example 125.50. Up to two decimal places.</span></label> : <p>Existing prices are changed in Variants, not by Save Product.</p>}
    <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={product?.active ?? false} />Active in catalogue</label>
    <p className="admin-field-help">Deactivate to archive. Existing orders keep their original snapshots.</p></fieldset>
    {!product && error && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Start a separate creation? The previous request may have succeeded. Check the catalogue first.')) { creation.current = null; setError(''); } }}>Start a new creation</button>}
    <div className="admin-editor-actions"><button className="button" disabled={busy||!canSaveReviewedImage(assets,imagePath,preview)}>{busy ? 'Saving…' : 'Save Product'}</button><button type="button" disabled={busy||!cancel} onClick={cancel}>Cancel</button></div>
  </AdminForm></>;
}

function ProductThumbnail({product}:{product:AdminProduct}) {
  const [broken,setBroken]=useState(false);
  return broken ? <span className="admin-product-thumbnail" aria-label="Image unavailable">No image</span> : <img className="admin-product-thumbnail" src={product.image_path} alt="" loading="lazy" onError={()=>setBroken(true)}/>;
}
export function CatalogueList({products,select}:{products:AdminProduct[];select:(product:AdminProduct)=>void}) {
  return <ul className="admin-catalogue-list">{products.map(product=><li key={product.id}><button className="admin-product-row" onClick={()=>select(product)}><ProductThumbnail key={`${product.id}:${product.image_path}`} product={product}/><span className="admin-product-summary"><strong className="admin-product-name">{product.name}</strong><span>{product.category}</span><span>Open editorial fields, variants and reviewed media</span></span><span className="status-pill">{product.active?'Active':'Archived'}</span></button></li>)}</ul>;
}

export function ProductManager({ token }: { token: string }) {
  const [products, setProducts] = useState<AdminProduct[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0); const [selected, setSelected] = useState<AdminProduct | null | undefined>(); const [query, setQuery] = useState('');
  const noticeTarget=useRef<HTMLParagraphElement>(null);
  const [editorDenied,setEditorDenied]=useState(false);const [variantsDenied,setVariantsDenied]=useState(false);const [mediaDenied,setMediaDenied]=useState(false);const blocked=editorDenied||variantsDenied||mediaDenied;
  const [dirty,setDirty]=useState(false);const [saving,setSaving]=useState(false);const [notice,setNotice]=useState('');
  useAdminReturnFocus(notice,noticeTarget);
  function choose(product:AdminProduct|null|undefined) {
    if(saving||blocked)return;
    if(selected!==undefined && !window.confirm('Leave this product workspace? Unsaved drafts will be discarded. An unconfirmed save may already have succeeded; review the catalogue before starting another creation.'))return;
    setDirty(false);setSelected(product);setNotice(product===undefined?'Returned to catalogue. Review any unconfirmed save before starting another creation.':'');
  }
  function saved(message:string){setDirty(false);setSelected(undefined);setRevision(value=>value+1);setNotice(message);}
  useEffect(() => { let active = true;
    async function load() { setLoading(true); setError(''); try {
      const data = await adminRpc(getSupabaseClient(), token, 'admin_list_products');
      const parsed = parseAdminRows(data,parseAdminProduct,row=>row.id,200); if (active) { setProducts(parsed); setLoading(false); }
    } catch (cause) { if (active) { setProducts([]); setSelected(undefined); setError(adminReadFailure(cause,'Products')); setLoading(false); } } }
    void load();
    return () => { active = false; };
  }, [token, revision]);
  const visible = products.filter(p => `${p.name} ${p.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section><h2>Products</h2><p>Showing up to 200 products, including archived products. Search matches names and categories in this loaded set, not the complete catalogue.</p>
    {notice&&<p role="status" className="admin-save-notice" ref={noticeTarget} tabIndex={-1}>{notice}</p>}
    {selected===undefined && <><label>Search loaded products<input value={query} onChange={e => setQuery(e.target.value)} type="search" /></label><button className="button" disabled={blocked||loading||Boolean(error)} onClick={() => choose(null)}>Create product</button></>}
    <AdminReadState loading={loading} message={loading?(products.length?'Refreshing products…':'Loading products…'):error} retry={()=>setRevision(r=>r+1)} retryLabel="Retry loading products" disabled={saving}/>{!loading && !error && selected===undefined && !visible.length && <p>No products match.</p>}
    {!blocked && !loading && !error && selected===undefined && <CatalogueList products={visible} select={choose}/>}
    {!loading && !error && selected!==undefined && <div className="admin-product-workspace" onChange={()=>setDirty(true)}>
      <button disabled={saving||blocked} onClick={()=>choose(undefined)}>Back to catalogue / Cancel</button>
      <p className="admin-field-help">{dirty?'Unsaved draft changes. ':''}Work on one section at a time. Product or media saves return to the catalogue; other drafts are discarded.</p>
      <details className="admin-save-guidance"><summary>Save and retry guidance</summary><p>Independent section saves do not save other drafts. If a save is unconfirmed, reload and review the catalogue before creating another product.</p></details>
      {selected&&<nav className="admin-product-sections" aria-label="Product sections"><a href="#product-editorial">Editorial fields</a><a href="#product-variants">Variants and SKUs</a><a href="#product-media">Reviewed media</a></nav>}
      <fieldset disabled={saving}><div id="product-editorial" tabIndex={-1}><ProductEditor key={`editor-${selected?.id ?? 'new'}`} product={selected} token={token} saved={result=>saved(productSaveMessage(result))} busyChanged={setSaving} cancel={()=>choose(undefined)} categories={categorySuggestions(products)} blocked={blocked} accessChanged={setEditorDenied}/></div>
      {selected&&<><div id="product-variants" tabIndex={-1}><p>Variant options, SKUs, price and active state are saved independently of editorial fields.</p><VariantManager key={`variants-${selected.id}`} productId={selected.id} token={token} busyChanged={setSaving} blocked={blocked} accessChanged={setVariantsDenied}/></div><div id="product-media" tabIndex={-1}><ProductMedia key={`media-${selected.id}-${selected.updated_at}`} product={selected} token={token} saved={()=>saved('Reviewed image saved successfully. Product and variant drafts are saved separately.')} busyChanged={setSaving} blocked={blocked} accessChanged={setMediaDenied}/></div></>}
      </fieldset>
    </div>}
  </section>;
}
