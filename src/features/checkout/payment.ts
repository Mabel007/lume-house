export type PaymentProvider = "orange" | "afri";
// Reserved for future trusted payment results. Selection/validation cannot mark paid.
export type PaymentStatus = "pending" | "awaiting_payment" | "paid" | "failed";
export const paymentProviders = {
  orange: { name: "Orange Money" },
  afri: { name: "Afrimoney" },
};
export function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (/^00232\d+$/.test(compact)) return "+" + compact.slice(2);
  if (/^232\d+$/.test(compact)) return "+" + compact;
  if (/^0\d{8}$/.test(compact)) return "+232" + compact.slice(1);
  if (/^\d{8}$/.test(compact)) return "+232" + compact;
  return compact;
}
// Network-neutral, example-free guidance shared by checkout and profile validation.
export const invalidPhoneMessage =
  "Enter a valid 8-digit Sierra Leone phone number.";
// Product format only: eight national digits, no provider/account verification.
export function validatePaymentPhone(value: string): string | null {
  return /^\+232\d{8}$/.test(normalizePhone(value))
    ? null
    : invalidPhoneMessage;
}
export function getPaymentPhone(
  contact: string,
  independent: string,
  reuse: boolean,
): string {
  return reuse ? contact : independent;
}
