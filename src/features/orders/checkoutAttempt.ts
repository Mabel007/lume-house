export type BagAttempt = { version: 1; ownerId: string; source: 'bag'; requestId: string };
export type DirectAttempt = { version: 1; ownerId: string; source: 'direct'; requestId: string; intentId: string; productId: string; variantId: string; quantity: number };
export type CheckoutAttempt = BagAttempt | DirectAttempt;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (owner: string) => `lume-checkout-attempt-${owner}`;
const legacyKey = (owner: string) => `lume-checkout-${owner}`;
// Written before any shared attempt can reach the server. A later localStorage
// denial must never make a known shared checkout look like an empty legacy tab.
const witnessKey = (owner: string) => `lume-checkout-shared-${owner}`;
const running = new Set<string>();
export function parseAttempt(raw: string, ownerId: string): CheckoutAttempt {
  const value = JSON.parse(raw) as Partial<Omit<DirectAttempt, 'source'>> & { source?: string };
  if (value.version !== 1 || value.ownerId !== ownerId || !uuid.test(value.requestId || '')) throw new Error('CHECKOUT_RECOVERY_INVALID');
  if (value.source === 'bag') return { version: 1, source: 'bag', ownerId, requestId: value.requestId! };
  if (value.source !== 'direct' || value.intentId !== value.requestId || typeof value.productId !== 'string' || !value.productId || value.productId.length > 150
    || typeof value.variantId !== 'string' || !value.variantId || value.variantId.length > 150 || !Number.isInteger(value.quantity) || value.quantity! < 1 || value.quantity! > 99) throw new Error('CHECKOUT_RECOVERY_INVALID');
  return { version: 1, source: 'direct', ownerId, requestId: value.requestId!, intentId: value.intentId!, productId: value.productId, variantId: value.variantId, quantity: value.quantity! };
}
function writeSession(storageKey: string, value: string) {
  window.sessionStorage.setItem(storageKey, value);
  if (window.sessionStorage.getItem(storageKey) !== value) throw new Error('CHECKOUT_STORAGE_UNAVAILABLE');
}
function readRecords(ownerId: string, source: CheckoutAttempt['source']) {
  const legacy = window.sessionStorage.getItem(legacyKey(ownerId));
  const witnessed = window.sessionStorage.getItem(witnessKey(ownerId));
  const witness = witnessed ? parseAttempt(witnessed, ownerId) : null;
  if (legacy && !uuid.test(legacy)) throw new Error('CHECKOUT_RECOVERY_INVALID');
  let raw: string | null;
  try { raw = window.localStorage.getItem(key(ownerId)); }
  catch {
    // Preserve the pre-existing, tab-local Bag contract only when this tab has
    // never observed/started a shared pending attempt. Direct always fails closed.
    if (source !== 'bag' || witness) throw new Error('CHECKOUT_STORAGE_UNAVAILABLE');
    return { attempt: legacy ? { version: 1, source: 'bag', ownerId, requestId: legacy } as BagAttempt : null, sharedAvailable: false };
  }
  const shared = raw ? parseAttempt(raw, ownerId) : null;
  if (shared && witness && JSON.stringify(shared) !== JSON.stringify(witness)) throw new Error('OTHER_CHECKOUT_PENDING');
  const attempt = shared || witness;
  if (legacy && attempt && (attempt.source !== 'bag' || attempt.requestId !== legacy)) throw new Error('OTHER_CHECKOUT_PENDING');
  if (shared && !witness) writeSession(witnessKey(ownerId), JSON.stringify(shared));
  return { attempt: attempt || (legacy ? { version: 1, source: 'bag', ownerId, requestId: legacy } as BagAttempt : null), sharedAvailable: true };
}
export function readAttempt(ownerId: string, source: CheckoutAttempt['source'] = 'direct'): CheckoutAttempt | null {
  return readRecords(ownerId, source).attempt;
}
export function rememberAttempt(candidate: CheckoutAttempt): CheckoutAttempt {
  const { attempt: existing, sharedAvailable } = readRecords(candidate.ownerId, candidate.source);
  if (existing) {
    if (existing.source !== candidate.source || existing.source === 'direct' && (candidate.source !== 'direct' || existing.intentId !== candidate.intentId || existing.productId !== candidate.productId || existing.variantId !== candidate.variantId || existing.quantity !== candidate.quantity)) throw new Error('OTHER_CHECKOUT_PENDING');
    return existing;
  }
  if (!sharedAvailable) {
    writeSession(legacyKey(candidate.ownerId), candidate.requestId);
    return candidate;
  }
  const raw = JSON.stringify(candidate);
  writeSession(witnessKey(candidate.ownerId), raw);
  try {
    window.localStorage.setItem(key(candidate.ownerId), raw);
    if (window.localStorage.getItem(key(candidate.ownerId)) !== raw) throw new Error('CHECKOUT_STORAGE_UNAVAILABLE');
  } catch {
    // A denied write may fall back only before invocation, with affirmative
    // evidence that no shared record was stored. Partial/unknown writes retain
    // the witness and block another request.
    let empty = false;
    try { empty = window.localStorage.getItem(key(candidate.ownerId)) === null; } catch { /* Unknown shared outcome. */ }
    if (candidate.source !== 'bag' || !empty) throw new Error('CHECKOUT_STORAGE_UNAVAILABLE');
    writeSession(legacyKey(candidate.ownerId), candidate.requestId);
    window.sessionStorage.removeItem(witnessKey(candidate.ownerId));
    if (window.sessionStorage.getItem(witnessKey(candidate.ownerId)) !== null) throw new Error('CHECKOUT_STORAGE_UNAVAILABLE');
    return candidate;
  }
  if (candidate.source === 'bag') writeSession(legacyKey(candidate.ownerId), candidate.requestId);
  return candidate;
}
export function completeAttempt(ownerId: string, requestId: string) {
  const { attempt, sharedAvailable } = readRecords(ownerId, 'bag');
  if (!attempt || attempt.requestId !== requestId) return;
  if (sharedAvailable) window.localStorage.removeItem(key(ownerId));
  window.sessionStorage.removeItem(witnessKey(ownerId));
  if (window.sessionStorage.getItem(legacyKey(ownerId)) === requestId) window.sessionStorage.removeItem(legacyKey(ownerId));
}
export async function withCheckoutLock<T>(ownerId: string, direct: boolean, operation: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (locks) return locks.request(`lume-checkout-${ownerId}`, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('CHECKOUT_BUSY');
    return operation();
  });
  // Legacy Bag remains usable; direct requires cross-tab atomic coordination.
  if (direct) throw new Error('CHECKOUT_LOCK_UNAVAILABLE');
  if (running.has(ownerId)) throw new Error('CHECKOUT_BUSY');
  running.add(ownerId);try { return await operation(); } finally { running.delete(ownerId); }
}
