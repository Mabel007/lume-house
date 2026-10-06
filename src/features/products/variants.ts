export type ProductVariant = {
  id: string; productId: string; options: Readonly<Record<string,string>>;
  isDefault: boolean; price: number; currency: 'NLE'; inventoryPolicy: 'untracked' | 'tracked'; available?:boolean;
};
export function parseVariants(value: unknown): ProductVariant[] {
  if (!Array.isArray(value)) throw new Error('Invalid variant response.');
  const ids=new Set<string>();
  return value.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid variant.');
    const r=value as Record<string,unknown>;
    if(typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.product_id!=='string'||!r.product_id||typeof r.is_default!=='boolean'||r.active!==true||r.currency!=='NLE'||!Number.isSafeInteger(r.price_cents)||(r.price_cents as number)<0||(r.price_cents as number)>2147483647||!['untracked','tracked'].includes(String(r.inventory_policy)))throw new Error('Invalid variant identity or availability.');
    if(!r.options||typeof r.options!=='object'||Array.isArray(r.options))throw new Error('Invalid variant options.');
    const options=r.options as Record<string,unknown>;
    if(Object.keys(options).length>8||Object.entries(options).some(([key,value])=>!key.trim()||key.length>40||typeof value!=='string'||!value.trim()||value.length>100)||r.is_default!== (Object.keys(options).length===0))throw new Error('Invalid variant options.');
    ids.add(r.id);
    return {id:r.id,productId:r.product_id,options:options as Record<string,string>,isDefault:r.is_default,price:r.price_cents as number,currency:'NLE',inventoryPolicy:r.inventory_policy as ProductVariant['inventoryPolicy']};
  });
}
export function variantAvailable(variant:ProductVariant|undefined):boolean {
  return !!variant&&(variant.inventoryPolicy==='untracked'||variant.available===true);
}
export function cataloguePrice(product:{price:number;variants?:readonly ProductVariant[]}):{price:number;from:boolean}{
  const choices=product.variants?.filter(variant=>Object.keys(variant.options).length>0)??[];
  if(!choices.length)return {price:product.variants?.find(variant=>variant.isDefault)?.price??product.price,from:false};
  const available=choices.filter(variantAvailable);
  return {price:Math.min(...(available.length?available:choices).map(variant=>variant.price)),from:true};
}
export function variantLabel(variant: Pick<ProductVariant,"options">): string {
  return Object.entries(variant.options).map(([key,value])=>`${key}: ${value}`).join(' · ');
}
export function requiresOptions(variants: readonly ProductVariant[] | undefined): boolean {
  return !!variants?.some(variant=>Object.keys(variant.options).length>0);
}

export function canUseLegacyBag(product: { price: number; variants?: readonly ProductVariant[] }): boolean {
  if(product.variants===undefined)return true;
  if(requiresOptions(product.variants))return false;
  const variant=product.variants.find(value=>value.isDefault);
  return !!variant && variant.price===product.price && variant.inventoryPolicy==='untracked';
}
