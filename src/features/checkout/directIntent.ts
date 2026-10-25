// Identifiers/quantity only. Never persist contact details, quotes or tokens.
export const directCheckoutPath = '/checkout/buy-now';
export function isDirectCheckoutPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '').toLowerCase() === directCheckoutPath;
}
const key = 'lume-direct-checkout-v1';
const eventName = 'lume-direct-checkout-change';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type DirectIntent = { id: string; productId: string; variantId: string; quantity: number; ownerId: string | null };
export type DirectState = { hold: boolean; intent: DirectIntent | null; invalid: boolean };
let memory = '';
export function directSnapshot(): string {
  try { return window.sessionStorage.getItem(key) || ''; } catch { return memory; }
}
export function parseDirectState(raw: string): DirectState {
  if (!raw) return { hold: false, intent: null, invalid: false };
  try {
    const value = JSON.parse(raw) as { hold?: unknown; intent?: Partial<DirectIntent> | null };
    if (value.hold !== true && value.hold !== false) throw new Error();
    const i = value.intent;
    if (i === null) return { hold: value.hold, intent: null, invalid: false };
    if (!i || typeof i.id !== 'string' || !uuid.test(i.id) || typeof i.productId !== 'string' || !i.productId || i.productId.length > 150
      || typeof i.variantId !== 'string' || !i.variantId || i.variantId.length > 150 || !Number.isInteger(i.quantity) || i.quantity! < 1 || i.quantity! > 99
      || !(i.ownerId === null || typeof i.ownerId === 'string' && uuid.test(i.ownerId))) throw new Error();
    return { hold: value.hold, intent: { id: i.id, productId: i.productId, variantId: i.variantId, quantity: i.quantity!, ownerId: i.ownerId }, invalid: false };
  } catch { return { hold: true, intent: null, invalid: true }; }
}
function write(state: Omit<DirectState, 'invalid'>) {
  const raw = JSON.stringify(state);
  // Fail closed if reload/OAuth preservation cannot be guaranteed.
  window.sessionStorage.setItem(key, raw);
  if (window.sessionStorage.getItem(key) !== raw) throw new Error('Checkout storage is unavailable.');
  memory = raw;
  window.dispatchEvent(new window.Event(eventName));
}
export function subscribeDirect(listener: () => void) {
  window.addEventListener(eventName, listener);window.addEventListener('storage', listener);
  return () => { window.removeEventListener(eventName, listener);window.removeEventListener('storage', listener); };
}
export function startDirectIntent(productId: string, variantId: string, quantity: number, ownerId: string | null): DirectIntent {
  const current = parseDirectState(directSnapshot());
  // Resume the existing purchase instead of overwriting a possibly pending one.
  if (current.intent) return resumeDirectIntent();
  const intent = { id: crypto.randomUUID(), productId, variantId, quantity, ownerId };
  if (parseDirectState(JSON.stringify({ hold: true, intent })).invalid) throw new Error('Invalid checkout selection.');
  write({ hold: true, intent });return intent;
}
export function resumeDirectIntent(): DirectIntent {
  const state = parseDirectState(directSnapshot());
  if (!state.intent || state.invalid) throw new Error('Checkout selection is unavailable.');
  // Re-entry and OAuth must durably re-arm the hold before navigation/auth.
  write({ hold: true, intent: state.intent });
  return state.intent;
}
export function bindDirectIntent(ownerId: string): DirectIntent | null {
  const state = parseDirectState(directSnapshot());
  if (!state.intent || state.intent.ownerId && state.intent.ownerId !== ownerId) return null;
  write({ hold: true, intent: { ...state.intent, ownerId } });
  return { ...state.intent, ownerId };
}
export function finishDirectIntent(id: string) {
  const state = parseDirectState(directSnapshot());
  if (state.intent?.id === id) write({ hold: true, intent: null });
}
export function cancelDirectIntent() { write({ hold: true, intent: null }); }
export function restoreDirectIntent(intent: DirectIntent) {
  if (parseDirectState(JSON.stringify({ hold: true, intent })).invalid) throw new Error('Invalid checkout selection.');
  write({ hold: true, intent });
}
export function resumeNormalBag() {
  const state = parseDirectState(directSnapshot());
  if (state.hold || state.invalid) write({ hold: false, intent: state.intent });
}
