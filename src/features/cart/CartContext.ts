import { createContext, useContext } from "react";
import type { CartItem, CartAction } from "./cart";
import type { Dispatch } from "react";

export const CartContext = createContext<{
  items: CartItem[];
  dispatch: Dispatch<CartAction>;
  status?: string;
  error?: string | null;
  retry?: () => void;
  beginCheckout?: () => boolean;
  finishCheckout?: (placed: boolean) => void;
} | null>(null);
export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("Cart must be used inside CartProvider");
  return cart;
}
