import { createContext, useContext } from "react";
import type { CartItem, CartAction } from "./cart";

export type CartOutcome =
  | { kind: "confirmed"; items: CartItem[] }
  | { kind: "rejected"; message: string }
  | { kind: "superseded" };
export type CartDispatch = (action: CartAction) => Promise<CartOutcome>;
export const CartContext = createContext<{
  items: CartItem[];
  dispatch: CartDispatch;
  status?: string;
  error?: string | null;
  retry?: () => void;
  beginCheckout?: () => number | null;
  finishCheckout?: (placed: boolean, ticket: number | null | undefined) => void;
} | null>(null);
export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("Cart must be used inside CartProvider");
  return cart;
}
