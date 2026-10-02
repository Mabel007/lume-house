import type { SupabaseClient } from "@supabase/supabase-js";
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
  return parseProducts(data, currency);
}
