import type { Session, SupabaseClient } from "@supabase/supabase-js";
export function watchSession(client: SupabaseClient, receive: (session: Session | null) => void, failed: () => void) {
  let active = true;
  let observed = false;
  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    observed = true;
    if (active) receive(session);
  });
  void client.auth.getSession().then(({ data, error }) => {
    if (!active) return;
    if (error) failed();
    else if (!observed) receive(data.session);
  }).catch(() => { if (active) failed(); });
  return () => { active = false; subscription.unsubscribe(); };
}
export function authRedirect(origin: string, configured?: string) {
  const url = new URL(configured || "/auth/callback", origin);
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid sign-in redirect configuration.");
  return url.href;
}
export async function startGoogleSignIn(client: SupabaseClient, redirectTo: string) {
  const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) throw new Error("Google sign-in could not start. Please try again.");
}
