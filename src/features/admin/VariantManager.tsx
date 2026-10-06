import { useEffect, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { adminRpc } from './adminRepository';
export type AdminVariant = {id:string;product_id:string;sku:string;options:Record<string,string>;is_default:boolean;price_cents:number;active:boolean;inventory_policy:string;updated_at:string};
export function VariantEditor({variant,productId,token,saved}:{variant:AdminVariant|null;productId:string;token:string;saved:()=>void}) {
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){ e.preventDefault();const data=new FormData(e.currentTarget);setError('');setBusy(true);
    try { const options=variant?.is_default?{}:JSON.parse(String(data.get('options')));
      await adminRpc(getSupabaseClient(),token,'admin_save_variant',{p_id:variant?.id??null,p_product_id:productId,p_expected_updated_at:variant?.updated_at??null,p_sku:data.get('sku'),p_options:options,p_price_cents:Number(data.get('price')),p_active:data.get('active')==='on'});saved();
    }catch(cause){setError(cause instanceof Error?cause.message:'Save failed.');}finally{setBusy(false);}
  }
  return <form className="admin-form" onSubmit={submit}><h4>{variant?.is_default?'Default variant':variant?'Edit variant':'Create option variant'}</h4>
    <label>SKU<input name="sku" required maxLength={150} readOnly={variant?.is_default} defaultValue={variant?.sku??''}/></label>
    {!variant?.is_default&&<label>Options (JSON object)<textarea name="options" required defaultValue={JSON.stringify(variant?.options??{},null,2)} aria-describedby="options-help"/></label>}
    <p id="options-help">Use genuine option names and values, for example a real colour or size. Do not invent default options.</p>
    <label>Price (NLe minor units)<input name="price" type="number" required min="0" step="1" defaultValue={variant?.price_cents??0}/></label>
    <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={variant?.active??false}/>Active variant</label>
    <p>Currency is NLE. Inventory policy is managed in Inventory. Deactivation preserves order history.</p>
    {error&&<p role="alert">{error}</p>}<button className="button" disabled={busy}>{busy?'Saving…':'Save variant'}</button>
  </form>;
}
export function VariantManager({productId,token}:{productId:string;token:string}){
  const [variants,setVariants]=useState<AdminVariant[]>([]);const [selected,setSelected]=useState<AdminVariant|null|undefined>();const [error,setError]=useState('');const [revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;adminRpc(getSupabaseClient(),token,'admin_list_variants',{p_product_id:productId}).then(data=>{if(!Array.isArray(data))throw new Error('Invalid variants response.');if(active)setVariants(data as AdminVariant[]);}).catch(cause=>{if(active)setError(cause.message);});return()=>{active=false;};},[token,productId,revision]);
  return <section><h3>Variants</h3>{error&&<p role="alert">{error}</p>}<button className="button" onClick={()=>setSelected(null)}>Create option variant</button>
    <ul className="admin-list">{variants.map(v=><li key={v.id}><button onClick={()=>setSelected(v)}>{v.is_default?'Default':Object.entries(v.options).map(([k,val])=>`${k}: ${val}`).join(', ')} — {v.sku} — {v.active?'Active':'Inactive'}</button></li>)}</ul>
    {selected!==undefined&&<VariantEditor key={selected?.id??'new'} variant={selected} productId={productId} token={token} saved={()=>{setSelected(undefined);setRevision(r=>r+1);}}/>}
  </section>;
}
