const routeTitles: Readonly<Record<string, string>> = {
  "/": "Shop",
  "/cart": "Your Bag",
  "/checkout": "Checkout",
  "/account": "Your account",
  "/auth/callback": "Your account",
  "/about": "About",
  "/help": "Help & Contact",
  "/help/delivery-pickup": "Delivery & Pickup",
  "/help/returns-refunds": "Returns & Refunds",
  "/privacy": "Privacy Policy",
  "/terms": "Terms & Conditions",
};

export function routeTitle(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (Object.hasOwn(routeTitles, path)) return routeTitles[path];
  if (path.startsWith("/account/")) return "Your account";
  if (path.startsWith("/orders/")) return "Your order";
  return "Page not found";
}

export function aboutFragmentTarget(pathname: string, hash: string): string | null {
  if (pathname.replace(/\/+$/, "") !== "/about") return null;
  try {
    const target = decodeURIComponent(hash.slice(1));
    return target === "our-story" || target === "our-values" ? target : null;
  } catch { return null; }
}
