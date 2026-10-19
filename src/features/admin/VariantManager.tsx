import {AdminReadState} from './AdminReadState';
import {parseAdminVariant,parseAdminVariants,type AdminVariant} from './adminVariants';
export type {AdminVariant} from './adminVariants';
import { AdminForm } from './AdminForm';
import { useAdminReturnFocus, type AdminErrorKind } from './adminFormBehavior';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { adminRpc, adminErrorKind, adminReadFailure, isAdminDenied } from './adminRepository';
import { optionRows, serializeOptions, type OptionRow } from './variantOptions';
import {majorToMinor,minorToMajor,majorPricePattern} from './priceInput';
import {formatMoney} from '../../config/shop';
export function VariantEditor({variant,productId,token,saved,busyChanged,cancel,blocked=false}:{variant:AdminVariant|null;productId:string;token:string;saved:()=>void;busyChanged?:(busy:boolean)=>void;cancel?:()=>void;blocked?:boolean}) {
  const submitting=useRef(false);const [error,setError]=useState('');const [errorKind,setErrorKind]=useState<AdminErrorKind>('validation');const [uncertain,setUncertain]=useState(false); const [busy,setBusy]=useState(false);
  const [initial] = useState(() => { try { return {rows: optionRows(variant?.options ?? {}), error: ''}; } catch { return {rows: [], error: 'Invalid existing options. Reload before editing.'}; } });
  const [rows, setRows] = useState<OptionRow[]>(initial.rows);
  const nextId = useRef(rows.length); const names = useRef(new Map<number, HTMLInputElement>()); const addButton = useRef<HTMLButtonElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[]);
  async function submit(e:FormEvent<HTMLFormElement>){ e.preventDefault();if(submitting.current||blocked)return;submitting.current=true;const data=new FormData(e.currentTarget);setError('');setBusy(true);busyChanged?.(true);
    let attempted=false;
    try { const options=variant?.is_default?{}:serializeOptions(rows);
      if (initial.error) throw new Error(initial.error);
      if (!variant?.is_default && !rows.length) throw new Error('An option variant needs at least one meaningful option.');
      const price=majorToMinor(String(data.get('price') ?? ''));attempted=true;
      const result=parseAdminVariant(await adminRpc(getSupabaseClient(),token,'admin_save_variant',{p_id:variant?.id??null,p_product_id:productId,p_expected_updated_at:variant?.updated_at??null,p_sku:data.get('sku'),p_options:options,p_price_cents:price,p_active:data.get('active')==='on'}),productId);if((variant&&result.id!==variant.id)||result.sku!==data.get('sku')||result.price_cents!==price||result.active!==(data.get('active')==='on')||JSON.stringify(result.options)!==JSON.stringify(options))throw new Error('Variant save was not confirmed. Review the variants before retrying.');setUncertain(false);saved();
    }catch(cause){const kind=adminErrorKind(cause,attempted);setErrorKind(kind);if(kind==='uncertain')setUncertain(true);setError(cause instanceof Error?cause.message:'Save failed.');}finally{submitting.current=false;setBusy(false);busyChanged?.(false);}
  }
  return <AdminForm hidden={blocked} blocked={blocked} className="admin-form" onSubmit={submit} busy={busy} error={error||initial.error} errorKind={initial.error?'validation':errorKind} uncertain={uncertain}><h4 ref={heading} tabIndex={-1}>{variant?.is_default?'Default variant':variant?'Edit variant':'Create option variant'}</h4>
    <label>SKU<input name="sku" required maxLength={150} readOnly={variant?.is_default} defaultValue={variant?.sku??''}/></label>
    {!variant?.is_default && !initial.error && <fieldset aria-describedby="options-help"><legend>Variant options</legend>
      {rows.map((row, index) => <div className="admin-option-row" key={row.id}>
        <label>Option {index + 1} name<input ref={node => { if (node) names.current.set(row.id, node); else names.current.delete(row.id); }} required maxLength={40} value={row.name} onChange={e => setRows(current => current.map(r => r.id === row.id ? {...r, name: e.target.value} : r))} /></label>
        <label>Option {index + 1} value<input required maxLength={100} value={row.value} onChange={e => setRows(current => current.map(r => r.id === row.id ? {...r, value: e.target.value} : r))} /></label>
        <button type="button" data-admin-draft-change="true" onClick={() => { const next = rows[index + 1] ?? rows[index - 1]; setRows(current => current.filter(r => r.id !== row.id)); if (next) names.current.get(next.id)?.focus(); else addButton.current?.focus(); }}>Remove option {index + 1}</button>
      </div>)}
      <button ref={addButton} type="button" data-admin-draft-change="true" disabled={rows.length >= 8 || busy} onClick={() => { const id = nextId.current++; setRows(current => [...current, {id, name: '', value: ''}]); requestAnimationFrame(() => names.current.get(id)?.focus()); }}>Add option</button>
    </fieldset>}
    <p id="options-help">Use genuine option names and values, for example a real colour or size. Do not invent default options.</p>
    <label>{variant?.is_default?'Default variant price (NLE)':'Selected variant price (NLE)'}<input name="price" type="text" inputMode="decimal" required maxLength={14} pattern={majorPricePattern} defaultValue={minorToMajor(variant?.price_cents??0)} aria-describedby="variant-price-help"/></label><p id="variant-price-help" className="admin-field-help">Enter NLE, for example 125.50. This price applies to this variant only; it is not a discount or an additional charge.</p>
    <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={variant?.active??false}/>Active variant</label>
    <p>Currency is NLE. Inventory policy is managed in Inventory. Deactivation preserves order history.</p>
    <div className="admin-editor-actions"><button className="button" disabled={busy || Boolean(initial.error)}>{busy?'Saving…':'Save variant'}</button><button type="button" disabled={busy||!cancel} onClick={cancel}>Cancel variant draft</button></div>
  </AdminForm>;
}
export function VariantList({variants,select}:{variants:AdminVariant[];select:(variant:AdminVariant)=>void}) {
  return <ul className="admin-list admin-variant-prices">{variants.map(variant=><li key={variant.id}><button onClick={()=>select(variant)}><strong>{variant.is_default?'Default variant':Object.entries(variant.options).map(([key,value])=>`${key}: ${value}`).join(', ')}</strong><span>SKU: {variant.sku}</span><span>{formatMoney(variant.price_cents)}</span><span>{variant.active?'Active':'Inactive'}</span></button></li>)}</ul>;
}
export function VariantManager({productId,token,busyChanged,blocked=false,accessChanged}:{productId:string;token:string;busyChanged?:(busy:boolean)=>void;blocked?:boolean;accessChanged?:(denied:boolean)=>void}){
  const [variants,setVariants]=useState<AdminVariant[]>([]);const [selected,setSelected]=useState<AdminVariant|null|undefined>();const [error,setError]=useState('');const [revision,setRevision]=useState(0);const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;async function load(){setLoading(true);setError('');try{const data=await adminRpc(getSupabaseClient(),token,'admin_list_variants',{p_product_id:productId});const parsed=parseAdminVariants(data,productId);if(active){accessChanged?.(false);setVariants(parsed);setLoading(false);}}catch(cause){if(active){if(isAdminDenied(cause))accessChanged?.(true);setVariants([]);setError(adminReadFailure(cause,'Variants'));setLoading(false);}}}void load();return()=>{active=false;};},[token,productId,revision,accessChanged]);
  const [saving,setSaving]=useState(false);const [notice,setNotice]=useState('');const noticeTarget=useRef<HTMLParagraphElement>(null);useAdminReturnFocus(notice,noticeTarget);
  function choose(variant:AdminVariant|null|undefined){if(saving)return;if(selected!==undefined&&!window.confirm('Discard this variant draft? If a save was unconfirmed, reload and review the variants first.'))return;setSelected(variant);setNotice(variant===undefined?'Variant draft closed. Review any unconfirmed save before another operation.':'');}
  return <section><h3>Variants</h3>{notice&&<p role="status" ref={noticeTarget} tabIndex={-1}>{notice}</p>}<p>Save variant applies only the selected variant. Product editorial fields and reviewed media are saved separately.</p><AdminReadState loading={loading} message={loading?(variants.length?'Refreshing variants…':'Loading variants…'):error} retry={()=>setRevision(r=>r+1)} retryLabel="Retry loading variants" disabled={saving}/><button className="button" disabled={blocked||saving||loading||Boolean(error)} onClick={()=>choose(null)}>Create option variant</button>
    {!loading&&!error&&!variants.length&&<p>No variants loaded.</p>}{!blocked&&!loading&&!error&&<VariantList variants={variants} select={choose}/>}

    {!loading&&!error&&selected!==undefined&&<VariantEditor key={selected?.id??'new'} variant={selected} productId={productId} token={token} blocked={blocked} cancel={()=>choose(undefined)} busyChanged={busy=>{setSaving(busy);busyChanged?.(busy);}} saved={()=>{setSelected(undefined);setRevision(r=>r+1);setNotice('Variant save confirmed. Product and media drafts are saved separately.');}}/>}
  </section>;
}
