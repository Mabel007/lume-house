import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../lib/supabase/client";
import { AuthContext } from "./AuthContext";
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
  async function signOut() {
    setError(null);
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      setSession(null);
    } catch { setError("Sign-out failed. Please try again."); }
  }
  return <AuthContext.Provider value={{ session, loading, error, signIn, signOut }}>{children}</AuthContext.Provider>;
}
