import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { adminRpc } from './adminRepository';
import { optionRows, serializeOptions, type OptionRow } from './variantOptions';
export type AdminVariant = {id:string;product_id:string;sku:string;options:Record<string,string>;is_default:boolean;price_cents:number;active:boolean;inventory_policy:string;updated_at:string};
export function VariantEditor({variant,productId,token,saved}:{variant:AdminVariant|null;productId:string;token:string;saved:()=>void}) {
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [initial] = useState(() => { try { return {rows: optionRows(variant?.options ?? {}), error: ''}; } catch { return {rows: [], error: 'Invalid existing options. Reload before editing.'}; } });
  const [rows, setRows] = useState<OptionRow[]>(initial.rows);
  const nextId = useRef(rows.length); const names = useRef(new Map<number, HTMLInputElement>()); const addButton = useRef<HTMLButtonElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[]);
  async function submit(e:FormEvent<HTMLFormElement>){ e.preventDefault();const data=new FormData(e.currentTarget);setError('');setBusy(true);
    try { const options=variant?.is_default?{}:serializeOptions(rows);
      if (initial.error) throw new Error(initial.error);
      if (!variant?.is_default && !rows.length) throw new Error('An option variant needs at least one meaningful option.');
      await adminRpc(getSupabaseClient(),token,'admin_save_variant',{p_id:variant?.id??null,p_product_id:productId,p_expected_updated_at:variant?.updated_at??null,p_sku:data.get('sku'),p_options:options,p_price_cents:Number(data.get('price')),p_active:data.get('active')==='on'});saved();
    }catch(cause){setError(cause instanceof Error?cause.message:'Save failed.');}finally{setBusy(false);}
  }
  return <form className="admin-form" onSubmit={submit}><h4 ref={heading} tabIndex={-1}>{variant?.is_default?'Default variant':variant?'Edit variant':'Create option variant'}</h4>
    <label>SKU<input name="sku" required maxLength={150} readOnly={variant?.is_default} defaultValue={variant?.sku??''}/></label>
    {initial.error && <p role="alert">{initial.error}</p>}
    {!variant?.is_default && !initial.error && <fieldset aria-describedby="options-help"><legend>Variant options</legend>
      {rows.map((row, index) => <div className="admin-option-row" key={row.id}>
        <label>Option {index + 1} name<input ref={node => { if (node) names.current.set(row.id, node); else names.current.delete(row.id); }} required maxLength={40} value={row.name} onChange={e => setRows(current => current.map(r => r.id === row.id ? {...r, name: e.target.value} : r))} /></label>
        <label>Option {index + 1} value<input required maxLength={100} value={row.value} onChange={e => setRows(current => current.map(r => r.id === row.id ? {...r, value: e.target.value} : r))} /></label>
        <button type="button" onClick={() => { const next = rows[index + 1] ?? rows[index - 1]; setRows(current => current.filter(r => r.id !== row.id)); if (next) names.current.get(next.id)?.focus(); else addButton.current?.focus(); }}>Remove option {index + 1}</button>
      </div>)}
      <button ref={addButton} type="button" disabled={rows.length >= 8 || busy} onClick={() => { const id = nextId.current++; setRows(current => [...current, {id, name: '', value: ''}]); requestAnimationFrame(() => names.current.get(id)?.focus()); }}>Add option</button>
    </fieldset>}
    <p id="options-help">Use genuine option names and values, for example a real colour or size. Do not invent default options.</p>
    <label>Price (NLe minor units)<input name="price" type="number" required min="0" step="1" defaultValue={variant?.price_cents??0}/></label>
    <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={variant?.active??false}/>Active variant</label>
    <p>Currency is NLE. Inventory policy is managed in Inventory. Deactivation preserves order history.</p>
    {error&&<p role="alert">{error}</p>}<button className="button" disabled={busy || Boolean(initial.error)}>{busy?'Saving…':'Save variant'}</button>
  </form>;
}
export function VariantManager({productId,token}:{productId:string;token:string}){
  const [variants,setVariants]=useState<AdminVariant[]>([]);const [selected,setSelected]=useState<AdminVariant|null|undefined>();const [error,setError]=useState('');const [revision,setRevision]=useState(0);const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;async function load(){setLoading(true);setError('');try{const data=await adminRpc(getSupabaseClient(),token,'admin_list_variants',{p_product_id:productId});if(!Array.isArray(data))throw new Error('Invalid variants response.');if(active){setVariants(data as AdminVariant[]);setLoading(false);}}catch(cause){if(active){setError(cause instanceof Error?cause.message:'Load failed.');setLoading(false);}}}void load();return()=>{active=false;};},[token,productId,revision]);
  return <section><h3>Variants</h3>{loading&&<p role="status">Loading variants…</p>}{error&&<p role="alert">{error} <button onClick={()=>setRevision(r=>r+1)}>Retry loading variants</button></p>}<button className="button" onClick={()=>setSelected(null)}>Create option variant</button>
    {!loading&&!error&&!variants.length&&<p>No variants loaded.</p>}{!loading&&!error&&<ul className="admin-list">{variants.map(v=><li key={v.id}><button onClick={()=>setSelected(v)}>{v.is_default?'Default':Object.entries(v.options).map(([k,val])=>`${k}: ${val}`).join(', ')} — {v.sku} — {v.active?'Active':'Inactive'}</button></li>)}</ul>}
    {!loading&&!error&&selected!==undefined&&<VariantEditor key={selected?.id??'new'} variant={selected} productId={productId} token={token} saved={()=>{setSelected(undefined);setRevision(r=>r+1);}}/>}
  </section>;
}
