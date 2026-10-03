import { useEffect, useState, type ReactNode } from "react";
import { ProductContext, type ProductState } from "./ProductContext";
import { loadProducts } from "./productRepository";
import { getSupabaseClient } from "../../lib/supabase/client";
import { shop } from "../../config/shop";
export function ProductProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProductState>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState({ status: "loading" });
      try {
        const products = await loadProducts(getSupabaseClient(), shop.currency, controller.signal);
        if (!controller.signal.aborted) setState({ status: "ready", products });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);
  return <ProductContext.Provider value={{ state, refresh: () => setRevision(value => value + 1) }}>{children}</ProductContext.Provider>;
}
