export type CartItem = { productId: string; quantity: number };
export type CartAction =
  | { type: "add"; productId: string }
  | { type: "quantity"; productId: string; quantity: number }
  | { type: "remove"; productId: string };
export const MAX_QUANTITY = 99;

export function cartReducer(state: CartItem[], action: CartAction): CartItem[] {
  if (action.type === "remove")
    return state.filter((item) => item.productId !== action.productId);
  if (action.type === "quantity") {
    if (
      !Number.isInteger(action.quantity) ||
      action.quantity < 1 ||
      action.quantity > MAX_QUANTITY
    )
      return state;
    return state.map((item) =>
      item.productId === action.productId
        ? { ...item, quantity: action.quantity }
        : item,
    );
  }
  const existing = state.find((item) => item.productId === action.productId);
  if (!existing)
    return [...state, { productId: action.productId, quantity: 1 }];
  return state.map((item) =>
    item.productId === action.productId
      ? { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + 1) }
      : item,
  );
}

export function getCartLines<T extends { id: string; price: number }>(
  cart: CartItem[],
  catalog: T[],
) {
  return cart.flatMap((item) => {
    const product = catalog.find((product) => product.id === item.productId);
    return product
      ? [
          {
            product,
            quantity: item.quantity,
            lineTotal: product.price * item.quantity,
          },
        ]
      : [];
  });
}
