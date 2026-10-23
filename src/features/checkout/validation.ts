// Customer-facing copy and pure checks for checkout text fields. These mirror the
// trusted SQL rules (non-blank after trim, Freetown-only delivery, simple email
// shape) so the client can explain a problem early; the database stays authoritative.
export const checkoutMessages = {
  fullName: "Enter your full name.",
  email: "Enter your email address.",
  emailFormat: "Enter a valid email address.",
  address: "Enter your street address or landmark.",
  area: "Enter your area or community.",
  city: "Enter your city or town.",
  zone: "Choose your delivery zone.",
  contactPhone: "Enter your phone number.",
  paymentPhone: "Enter your mobile-money number.",
  unsupportedCity: "Delivery to this location isn't available yet. We currently deliver to selected areas of Freetown, Sierra Leone. You can choose a supported delivery area or Lumley pickup.",
} as const;

export function cityProblem(
  city: string,
  serviceCity: string,
): string | undefined {
  const trimmed = city.trim();
  if (!trimmed) return checkoutMessages.city;
  if (trimmed.toLowerCase() !== serviceCity.trim().toLowerCase())
    return checkoutMessages.unsupportedCity;
  return undefined;
}

// Matches the trusted customer_email shape (local part, single @, dotted domain)
// and agrees with the browser's type="email" gate for the values we accept.
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
