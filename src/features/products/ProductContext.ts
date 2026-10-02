import { createContext, useContext } from "react";
import type { Product } from "./products";

export type ProductState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; products: Product[] };
export const ProductContext = createContext<{
  state: ProductState;
  refresh: () => void;
} | null>(null);
export function useProducts() {
  const context = useContext(ProductContext);
  if (!context) throw new Error("Products must be used inside ProductProvider");
  return context;
}
