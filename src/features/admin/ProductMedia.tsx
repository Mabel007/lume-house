import {AdminReadState} from './AdminReadState';
import type { AdminErrorKind } from './adminFormBehavior';
import { AdminForm } from './AdminForm';
import { useRef, useState, type FormEvent } from 'react';
import { adminRpc, adminErrorKind, parseAdminProduct, type AdminProduct } from './adminRepository';
import { getSupabaseClient } from '../../lib/supabase/client';
import { ReviewedMediaPicker } from './ReviewedMediaPicker';
import { canSaveReviewedImage, useReviewedAssets, type ImagePreview } from './reviewedMedia';

export function ProductMedia({product, token, saved, busyChanged,blocked=false,accessChanged}: {product: AdminProduct; token: string; saved: () => void; busyChanged?: (busy:boolean)=>void;blocked?:boolean;accessChanged?:(denied:boolean)=>void}) {
  const {assets, reload} = useReviewedAssets(token,accessChanged);
  const [error, setError] = useState('');const [errorKind,setErrorKind]=useState<AdminErrorKind>('validation');const [uncertain,setUncertain]=useState(false); const [busy, setBusy] = useState(false); const submitting = useRef(false);
  const [path, setPath] = useState(product.image_path); const [preview, setPreview] = useState<ImagePreview>({path, status: 'loading'});
  function retry() { setPreview({path, status: 'loading'}); reload(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current||blocked) return;
    if (!canSaveReviewedImage(assets, path, preview)) { setErrorKind('validation');setError('Choose a reviewed image with a working preview before saving.'); return; }
    submitting.current = true; setBusy(true); busyChanged?.(true); setError('');
    try { const result = parseAdminProduct(await adminRpc(getSupabaseClient(), token, 'admin_set_product_media', {p_product_id: product.id, p_expected_updated_at: product.updated_at, p_path: path}));
      if (result.id !== product.id || result.image_path !== path) throw new Error('Image save was not confirmed. Review the catalogue before retrying.');
      setUncertain(false);saved(); }
    catch (cause) { const kind=adminErrorKind(cause,true);setErrorKind(kind);if(kind==='uncertain')setUncertain(true);setError(cause instanceof Error ? cause.message : 'Media could not be saved.'); }
    finally { submitting.current = false; setBusy(false); busyChanged?.(false); }
  }
  return <section><h3>Product media</h3><p>Select a reviewed existing asset for the primary image. Uploads and galleries are not available yet. Existing order snapshots are unchanged.</p>
    {blocked&&assets.status==='error'&&<AdminReadState message={assets.message} retry={reload} retryLabel="Reload media" disabled={busy}/>}
    <AdminForm hidden={blocked} blocked={blocked} className="admin-form" onSubmit={submit} busy={busy} error={error} errorKind={errorKind} uncertain={uncertain}>
      <ReviewedMediaPicker assets={assets} value={path} change={value => {setPath(value); setPreview({path: value, status: 'loading'}); setError('');}} preview={preview} previewChanged={setPreview} reload={retry} disabled={busy}/>
      <p>The storefront uses the product name as its image description. Select imagery that represents this product accurately. This save applies only to the primary image.</p>

      <button className="button" disabled={busy || !canSaveReviewedImage(assets, path, preview)}>{busy ? 'Saving…' : 'Save primary image'}</button>
    </AdminForm>
  </section>;
}
