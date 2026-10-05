import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cartReducer, type CartItem, type CartAction } from "./cart";
import { CartContext } from "./CartContext";
import { useAuth } from "../auth/AuthContext";
import { getSupabaseClient } from "../../lib/supabase/client";
import { loadCustomerCart, mergeGuestCart, writeCartItem, visibleCart } from "./cartRepository";

const storageKey = "lume-guest-cart";
function readGuest(): CartItem[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
    return Array.isArray(value) ? value.filter((item): item is CartItem => !!item && typeof item.productId === "string" && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99) : [];
  } catch { return []; }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const userId = auth.session?.user.id;
  const identity = useRef(userId);
  const epoch = useRef(0);
  useLayoutEffect(() => { identity.current = userId; epoch.current += 1; }, [userId]);
  const [guestItems, setGuestItems] = useState(readGuest);
  const guest = useRef<CartItem[]>(guestItems);
  const current = useRef<CartItem[]>([]);
  const cartId = useRef<string | null>(null);
  const [saved, setSaved] = useState<{ userId: string; items: CartItem[] } | null>(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const locked = useRef(false);
  function storeGuest(items: CartItem[]) {
    guest.current = items; setGuestItems(items);
    try { sessionStorage.setItem(storageKey, JSON.stringify(items)); } catch { /* Memory cart remains available if storage is blocked. */ }
  }
  useEffect(() => {
    let active = true;
    cartId.current = null; current.current = []; locked.current = true;
    async function restore() {
      setError(null); setStatus("loading");
      if (auth.loading) return;
      if (!userId) { setSaved(null); setStatus("ready"); locked.current = false; return; }
      try {
        const client = getSupabaseClient();
        const loaded = await loadCustomerCart(client, userId);
        if (!active || identity.current !== userId) return;
        cartId.current = loaded.id;
        const merged = await mergeGuestCart(loaded.items, [...guest.current], async (item, exists) => {
          if (!active || identity.current !== userId) throw new Error("Session changed.");
          await writeCartItem(client, loaded.id, item.productId, item.quantity, exists);
        }, productId => storeGuest(guest.current.filter(item => item.productId !== productId)));
        if (active && identity.current === userId) { current.current = merged; setSaved({ userId, items: merged }); setStatus("ready"); locked.current = false; }
      } catch {
        if (active) { setError("Your saved Bag could not be restored or merged. Unsaved guest items are retained. Please retry."); setStatus("error"); }
      }
    }
    void restore();
    return () => { active = false; };
  }, [userId, auth.loading, revision]);
  function dispatch(action: CartAction) {
    if (auth.loading || locked.current) return;
    if (!userId) { storeGuest(cartReducer(guest.current, action)); return; }
    const id = cartId.current;
    if (!id) return;
    const generation = epoch.current;
    const before = current.current;
    const next = cartReducer(before, action);
    const item = next.find(item => item.productId === action.productId);
    locked.current = true; setStatus("saving"); setError(null);
    void writeCartItem(getSupabaseClient(), id, action.productId, item?.quantity ?? null, before.some(item => item.productId === action.productId)).then(() => {
      if (identity.current === userId && epoch.current === generation) { current.current = next; setSaved({ userId, items: next }); }
    }).catch(() => { if (identity.current === userId && epoch.current === generation) setError("Your Bag change was not saved. Please try again."); }).finally(() => {
      if (identity.current === userId && epoch.current === generation) { locked.current = false; setStatus("ready"); }
    });
  }
  const items = visibleCart(auth.loading, userId, saved, guestItems);
  function beginCheckout() {
    if (!userId || locked.current || status !== 'ready') return false;
    locked.current = true; setStatus('checking-out'); return true;
  }
  function finishCheckout(placed: boolean) {
    if (!userId || identity.current !== userId) return;
    if (placed) { current.current = []; setSaved({ userId, items: [] }); }
    locked.current = false; setStatus('ready');
  }
  return (
    <CartContext.Provider value={{ items, dispatch, status, error, retry: () => setRevision(value => value + 1), beginCheckout, finishCheckout }}>
      {children}
    </CartContext.Provider>
  );
}
