import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../lib/supabase/client";
import { AuthContext, createSignOutController, type SignOutResult } from "./AuthContext";
import { authRedirect, startGoogleSignIn, watchSession } from "./auth";
import { setAdminAuthIntent } from './adminAuthIntent';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    try {
      const client = getSupabaseClient();
      const stop = watchSession(client, next => { setSession(next); setLoading(false); }, () => { setLoading(false); setError("Your session could not be restored. Please sign in again."); });
      return () => { active = false; stop(); };
    } catch { queueMicrotask(() => { if (active) { setLoading(false); setError("Account services are unavailable. Please try again later."); } }); }
    return () => { active = false; };
  }, []);
  async function signIn(adminReturnTo?: string) {
    setError(null);
    try { setAdminAuthIntent(window.sessionStorage, adminReturnTo); await startGoogleSignIn(getSupabaseClient(), authRedirect(window.location.origin, import.meta.env.VITE_AUTH_REDIRECT_URL)); }
    catch { try { setAdminAuthIntent(window.sessionStorage); } catch { /* Browser storage may be unavailable. */ } setError("Google sign-in could not start. Please try again."); }
  }
  const requestSignOut = useCallback(async (): Promise<SignOutResult> => {
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      setSession(null);
      setError(null);
      return { ok: true };
    } catch {
      const message = "Sign-out failed. Please try again.";
      setError(message);
      return { ok: false, message };
    }
  }, []);
  // One controller per auth context: every signed-in surface shares its
  // in-flight guard and pending state, so a second attempt cannot race the first.
  const signOutController = useMemo(() => createSignOutController(requestSignOut), [requestSignOut]);
  // Admin surfaces call signOut directly; routing it through the controller keeps
  // them covered by the same single-in-flight guarantee.
  const signOut = useCallback((): Promise<SignOutResult> => signOutController.run(), [signOutController]);
  return <AuthContext.Provider value={{ session, loading, error, signIn, signOut, signOutController }}>{children}</AuthContext.Provider>;
}
