import { useEffect, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { adminRpc, parseAdminProduct, type AdminProduct } from './adminRepository';
import { VariantManager } from './VariantManager';

export function ProductEditor({ product, token, saved }: { product: AdminProduct | null; token: string; saved: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try { await adminRpc(getSupabaseClient(), token, 'admin_save_product', {
      p_id: product?.id ?? null, p_expected_updated_at: product?.updated_at ?? null,
      p_name: form.get('name'), p_description: form.get('description'), p_category: form.get('category'),
      p_image_path: form.get('image_path'), p_background_color: form.get('background_color'),
      p_display_order: Number(form.get('display_order')), p_active: form.get('active') === 'on',
      p_initial_price: product ? null : Number(form.get('initial_price')),
    }); saved(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Save failed.'); }
    finally { setBusy(false); }
  }
  return <form className="admin-form" onSubmit={submit}><h3>{product ? `Edit ${product.name}` : 'Create product'}</h3>
    <p>Editorial fields belong to the product. Prices and options belong to its variants.</p>
    <label>Name<input name="name" required maxLength={200} defaultValue={product?.name ?? ''} /></label>
    <label>Description<textarea name="description" required maxLength={2000} defaultValue={product?.description ?? ''} /></label>
    <label>Category<input name="category" required maxLength={100} defaultValue={product?.category ?? ''} /></label>
    <label>Existing image path<input name="image_path" required maxLength={500} defaultValue={product?.image_path ?? '/images/mug.svg'} /></label>
    <p>Use an existing reviewed file under /images/. Uploads are not available.</p>
    <label>Background colour<input name="background_color" required pattern="#[0-9a-fA-F]{6}" defaultValue={product?.background_color ?? '#e9e3d8'} /></label>
    <label>Display order<input name="display_order" type="number" required min="0" step="1" defaultValue={product?.display_order ?? 0} /></label>
    {!product && <label>Initial default variant price (NLe minor units)<input name="initial_price" type="number" required min="0" step="1" /></label>}
    <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={product?.active ?? false} />Active in catalogue</label>
    <p>Deactivate to archive. Existing orders keep their original snapshots.</p>
    {error && <p role="alert">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
  </form>;
}

export function ProductManager({ token }: { token: string }) {
  const [products, setProducts] = useState<AdminProduct[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0); const [selected, setSelected] = useState<AdminProduct | null | undefined>(); const [query, setQuery] = useState('');
  useEffect(() => { let active = true;
    adminRpc(getSupabaseClient(), token, 'admin_list_products').then(data => {
      if (!Array.isArray(data)) throw new Error('Invalid catalogue response.');
      const parsed = data.map(parseAdminProduct); if (active) { setProducts(parsed); setLoading(false); }
    }).catch(cause => { if (active) { setError(cause.message); setLoading(false); } });
    return () => { active = false; };
  }, [token, revision]);
  const visible = products.filter(p => `${p.name} ${p.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section><h2>Products</h2><p>Showing up to 200 products, including archived products.</p>
    <label>Search products<input value={query} onChange={e => setQuery(e.target.value)} type="search" /></label><button className="button" onClick={() => setSelected(null)}>Create product</button>
    {loading && <p role="status">Loading products…</p>}{error && <p role="alert">{error}</p>}{!loading && !error && !visible.length && <p>No products match.</p>}
    <ul className="admin-list">{visible.map(p => <li key={p.id}><button onClick={() => setSelected(p)}>{p.name} — {p.active ? 'Active' : 'Archived'}</button></li>)}</ul>
    {selected !== undefined && <ProductEditor key={selected?.id ?? 'new'} product={selected} token={token} saved={() => { setSelected(undefined); setRevision(r => r + 1); }} />}
    {selected && <VariantManager key={selected.id} productId={selected.id} token={token} />}
  </section>;
}
