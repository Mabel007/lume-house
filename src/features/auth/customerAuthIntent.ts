import { directCheckoutPath, directSnapshot, parseDirectState, resumeDirectIntent } from '../checkout/directIntent.ts';
const key = 'lume-customer-auth-return';
export function prepareCustomerAuthReturn() {
  const intent = resumeDirectIntent();
  window.sessionStorage.setItem(key, intent.id);
  if (window.sessionStorage.getItem(key) !== intent.id) throw new Error('Checkout storage is unavailable.');
}
export function consumeCustomerAuthReturn(): string | null {
  const id = window.sessionStorage.getItem(key);
  const state = parseDirectState(directSnapshot());
  if (id && id === state.intent?.id) {
    resumeDirectIntent();
    window.sessionStorage.removeItem(key);
    return directCheckoutPath;
  }
  window.sessionStorage.removeItem(key);
  return null;
}
export function clearCustomerAuthReturn() { window.sessionStorage.removeItem(key); }
export function hasCustomerAuthReturn(): boolean {
  try { const id=window.sessionStorage.getItem(key);return !!id&&id===parseDirectState(directSnapshot()).intent?.id; } catch { return false; }
}
