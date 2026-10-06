import type { SupabaseClient } from "@supabase/supabase-js";
import { parseVariants, cataloguePrice } from "./variants.ts";
import { parseProducts } from "./products.ts";

export async function loadProducts(
  client: SupabaseClient,
  currency: string,
  signal: AbortSignal,
) {
  const { data, error } = await client
    .from("products")
    .select(
      "id,name,description,price_cents,currency,image_path,category,background_color,active",
    )
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true })
    .abortSignal(signal);
  // Do not show raw provider errors or connection values to customers.
  if (error) throw new Error("Products could not be loaded.");
  const products = parseProducts(data, currency);
  const variants = await client.from("product_variants").select("id,product_id,options,is_default,price_cents,currency,active,inventory_policy").eq("active",true).order("id").abortSignal(signal);
  if(variants.error) {
    // Expand-first deployments may precede the schema. No other error silently
    // degrades variant data or becomes a fallback/demo catalogue.
    if(variants.error.code === "PGRST205" || variants.error.code === "42P01") return products;
    throw new Error("Products could not be loaded.");
  }
  let rows=parseVariants(variants.data);
  if(rows.some(variant=>variant.inventoryPolicy==='tracked')){
    const result=await client.rpc('catalogue_variant_availability').abortSignal(signal);
    if(result.error||!Array.isArray(result.data))throw new Error('Product availability could not be loaded.');
    const available=new Map<string,boolean>();
    for(const row of result.data){
      if(!row||typeof row.variant_id!=='string'||typeof row.available!=='boolean'||available.has(row.variant_id))throw new Error('Invalid product availability.');
      available.set(row.variant_id,row.available);
    }
    rows=rows.map(variant=>({...variant,available:available.get(variant.id)===true}));
  }
  if(rows.some(variant=>!products.some(product=>product.id===variant.productId)))throw new Error("Products could not be loaded.");
  return products.map(product=>{
    const variants=rows.filter(variant=>variant.productId===product.id);
    return {...product,price:cataloguePrice({...product,variants}).price,variants};
  });
}
