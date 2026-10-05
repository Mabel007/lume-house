import type { SupabaseClient } from "@supabase/supabase-js";
import { parseVariants } from "./variants.ts";
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
  const rows=parseVariants(variants.data);
  if(rows.some(variant=>!products.some(product=>product.id===variant.productId)))throw new Error("Products could not be loaded.");
  return products.map(product=>{
    const variants=rows.filter(variant=>variant.productId===product.id);
    return {...product,price:variants.find(variant=>variant.isDefault)?.price??variants[0]?.price??product.price,variants};
  });
}
