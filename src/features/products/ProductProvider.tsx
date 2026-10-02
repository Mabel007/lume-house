import type { ReactNode } from "react";
import { ProductContext } from "./ProductContext";
import { catalog } from "./catalog";
// Explicit local source for this phase; existing network adapter is deferred.
export function ProductProvider({ children }: { children: ReactNode }) {
 return <ProductContext.Provider value={{ state: { status: "ready", products: catalog.filter(product => product.active) }, refresh() {} }}>{children}</ProductContext.Provider>;
}
