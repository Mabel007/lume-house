import { createContext, useContext } from "react";
import type { CartItem, CartAction } from "./cart";
import type { CartFailureKind } from "./variantCartRepository";

export type CartOutcome =
  | { kind: "confirmed"; items: CartItem[] }
  | { kind: "rejected"; message: string; failure: CartFailureKind }
  | { kind: "superseded" };
export type CartDispatch = (action: CartAction) => Promise<CartOutcome>;
/**
 * A saved Bag that may be out of date after a refused or unconfirmed change.
 * `required` asks the customer to reconcile, `refreshing` is in flight,
 * `completed` means the trusted restore resolved, `failed` keeps the action
 * available without claiming reconciliation.
 */
export type CartRecovery = {
  status: "required" | "refreshing" | "completed" | "failed";
  message: string;
};
export const CartContext = createContext<{
  items: CartItem[];
  dispatch: CartDispatch;
  status?: string;
  error?: string | null;
  retry?: () => void;
  recovery?: CartRecovery | null;
  refreshSavedCart?: () => void;
  beginCheckout?: () => number | null;
  finishCheckout?: (placed: boolean, ticket: number | null | undefined) => void;
} | null>(null);
export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("Cart must be used inside CartProvider");
  return cart;
}
