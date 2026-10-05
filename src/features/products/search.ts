import type {Product} from './products.ts';
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en');
export function searchProducts<T extends Pick<Product,'name'|'category'|'description'>>(products:T[],query:string,category:string):T[]{
  const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
  return products.filter(product=>{
    if(category!=='All pieces'&&product.category!==category)return false;
    const text=normalize(`${product.name} ${product.category} ${product.description}`);
    return terms.every(term=>text.includes(term));
  });
}
