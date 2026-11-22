import { adminSection, isAdminRoute } from "./adminNavigation";

const routeTitles: Readonly<Record<string, string>> = {
  "/": "Shop",
  "/cart": "Your Cart",
  "/checkout": "Checkout",
  "/checkout/buy-now": "Buy Now checkout",
  "/account": "Your account",
  "/auth/callback": "Your account",
  "/about": "About",
  "/help": "Help & Contact",
  "/help/delivery-pickup": "Delivery & Pickup",
  "/help/returns-refunds": "Returns & Refunds",
  "/privacy": "Privacy Policy",
  "/terms": "Terms & Conditions",
};

export function productPathId(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const match = /^\/products\/([^/]+)$/i.exec(path);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function routeTitle(pathname: string, productName?: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const normalized = path.toLowerCase();
  if (Object.hasOwn(routeTitles, normalized)) return routeTitles[normalized];
  if (productPathId(path)) return productName || "Product details";
  if (normalized.startsWith("/account/")) return "Your account";
  if (isAdminRoute(normalized)) return `${adminSection(normalized)?.title ?? "Page not found"} | Administration`;
  if (normalized.startsWith("/orders/")) return "Your order";
  return "Page not found";
}

export function aboutFragmentTarget(pathname: string, hash: string): string | null {
  if (pathname.replace(/\/+$/, "") !== "/about") return null;
  try {
    const target = decodeURIComponent(hash.slice(1));
    return target === "our-story" || target === "our-values" ? target : null;
  } catch { return null; }
}
