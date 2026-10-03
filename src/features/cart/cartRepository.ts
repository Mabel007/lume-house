import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_QUANTITY, type CartItem } from "./cart.ts";
export function visibleCart(loading: boolean, userId: string | undefined, saved: { userId: string; items: CartItem[] } | null, guest: CartItem[]) {
  return loading ? [] : userId ? saved?.userId === userId ? saved.items : [] : guest;
}
export async function loadCustomerCart(client: SupabaseClient, userId: string) {
  let { data: cart, error } = await client.from("carts").select("id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Your saved cart could not be loaded.");
  if (!cart) {
    const created = await client.from("carts").insert({ user_id: userId }).select("id").single();
    if (created.error?.code === "23505") {
      const retry = await client.from("carts").select("id").eq("user_id", userId).single();
      cart = retry.data; error = retry.error;
    } else { cart = created.data; error = created.error; }
    if (error || !cart) throw new Error("Your saved cart could not be opened.");
  }
  const result = await client.from("cart_items").select("product_id,quantity").eq("cart_id", cart.id).order("product_id");
  if (result.error) throw new Error("Your saved cart could not be loaded.");
  const items: CartItem[] = (result.data || []).map(row => {
    if (typeof row.product_id !== "string" || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > MAX_QUANTITY) throw new Error("Your saved cart contains invalid quantities.");
    return { productId: row.product_id, quantity: row.quantity };
  });
  return { id: cart.id as string, items };
}
export async function writeCartItem(client: SupabaseClient, cartId: string, productId: string, quantity: number | null, exists: boolean) {
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY)) throw new Error("Invalid cart quantity.");
  const table = () => client.from("cart_items");
  let result;
  if (quantity === null) result = await table().delete().eq("cart_id", cartId).eq("product_id", productId);
  else if (exists) result = await table().update({ quantity }).eq("cart_id", cartId).eq("product_id", productId);
  else {
    result = await table().insert({ cart_id: cartId, product_id: productId, quantity });
    if (result.error?.code === "23505") result = await table().update({ quantity }).eq("cart_id", cartId).eq("product_id", productId);
  }
  if (result.error) throw new Error("Your cart change could not be saved. Please try again.");
}
export async function mergeGuestCart(remote: CartItem[], guest: CartItem[], write: (item: CartItem, exists: boolean) => Promise<void>, committed: (id: string) => void) {
  const merged = [...remote];
  for (const item of guest) {
    const index = merged.findIndex(value => value.productId === item.productId);
    const next = { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + (index < 0 ? 0 : merged[index].quantity)) };
    await write(next, index >= 0);
    if (index < 0) merged.push(next); else merged[index] = next;
    committed(item.productId);
  }
  return merged;
}
