import { useEffect, useState, type FormEvent } from 'react';
import { adminRpc, type AdminProduct } from './adminRepository';
import { getSupabaseClient } from '../../lib/supabase/client';

export function ProductMedia({product, token, saved}: {product: AdminProduct; token: string; saved: () => void}) {
  const [paths, setPaths] = useState<string[]>([]); const [error, setError] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  const [path, setPath] = useState(product.image_path); const [broken, setBroken] = useState(false);
  useEffect(() => { let active = true;
    void adminRpc(getSupabaseClient(), token, 'admin_media_assets').then(value => {
      if (!Array.isArray(value) || value.some(p => typeof p !== 'string' || !p.startsWith('/images/'))) throw new Error('Invalid media response.');
      if (active) { setPaths(value); setLoading(false); }
    }).catch(() => { if (active) { setError('Reviewed media could not be loaded.'); setLoading(false); } });
    return () => { active = false; };
  }, [token, revision]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await adminRpc(getSupabaseClient(), token, 'admin_set_product_media', {p_product_id: product.id, p_expected_updated_at: product.updated_at, p_path: path}); saved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Media could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section><h3>Product media</h3><p>Select a reviewed existing asset for the primary image. Uploads and galleries are not available yet. Existing order snapshots are unchanged.</p>
    {loading && <p role="status">Loading reviewed media…</p>}
    {error && <p role="alert">{error} <button onClick={() => {setLoading(true); setError(''); setRevision(r => r + 1);}}>Reload media</button></p>}
    {!loading && paths.length > 0 && <form className="admin-form" onSubmit={submit}>
      <label>Reviewed primary image<select value={path} onChange={e => {setPath(e.target.value); setBroken(false);}}>
        {!paths.includes(path) && <option value={path} disabled>Current legacy image</option>}
        {paths.map(p => <option key={p} value={p}>{p}</option>)}
      </select></label>
      {broken ? <p role="status">Preview unavailable. Choose another reviewed image.</p> : <img className="admin-media-preview" src={path} alt={`Preview for ${product.name}`} onError={() => setBroken(true)} />}
      <p>The storefront uses the product name as its image description. Select imagery that represents this product accurately.</p>
      <button className="button" disabled={busy || broken || !paths.includes(path)}>{busy ? 'Saving…' : 'Save primary image'}</button>
    </form>}
    {!loading && !error && !paths.length && <p>No reviewed assets are available.</p>}
  </section>;
}
