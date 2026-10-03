// Only an owner-scoped random request ID persists; never checkout personal data.
export function pendingRequest(userId: string): string | null {
  try { const value=sessionStorage.getItem(`lume-checkout-${userId}`); return value && /^[0-9a-f-]{36}$/i.test(value)?value:null; } catch { return null; }
}
export function rememberRequest(userId: string, requestId: string) {
  try { sessionStorage.setItem(`lume-checkout-${userId}`,requestId); } catch { /* In-memory retry key still works. */ }
}
export function clearRequest(userId: string) {
  try { sessionStorage.removeItem(`lume-checkout-${userId}`); } catch { /* No checkout fields stored. */ }
}
