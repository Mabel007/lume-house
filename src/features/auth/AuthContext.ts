import { createContext, useContext, useMemo } from "react";
import type { Session } from "@supabase/supabase-js";

/**
 * Sign-out always resolves with an explicit outcome so callers never have to
 * infer success from "the promise did not reject". The provider still records
 * the message in `error` for existing surfaces, but a caller that needs to act
 * on the result (pending states, retryable errors) reads `ok`/`message`.
 */
export type SignOutResult = { ok: true } | { ok: false; message: string };

export type AuthState = { loading: boolean; session: Session | null; error: string | null; signIn: (adminReturnTo?: string) => Promise<void>; signOut: () => Promise<SignOutResult>; sessionGeneration: number };

/** What a signed-in customer surface needs to render and start a sign-out. */
export type CustomerSignOut = {
  signingOut: boolean;
  error: string | null;
  signOut: () => Promise<void>;
};

/**
 * A sign-out request paired with the shared in-flight guard and pending state.
 *
 * `run` is idempotent: while a request is pending it joins the existing promise
 * instead of issuing another one, so a second attempt from any surface cannot
 * race the first. `signingOut` flips true for the whole lifetime of the request
 * and false once it settles, and `error` holds the retryable failure message.
 */
export function createSignOutController(request: () => Promise<SignOutResult>) {
  let inFlight: Promise<SignOutResult> | null = null;
  const listeners = new Set<() => void>();
  let signingOut = false;
  let error: string | null = null;
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    get signingOut() { return signingOut; },
    get error() { return error; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    run(): Promise<SignOutResult> {
      if (inFlight) return inFlight;
      signingOut = true;
      error = null;
      notify();
      const settled = request()
        .catch((): SignOutResult => ({ ok: false, message: "Sign-out failed. Please try again." }))
        .then(result => {
          if (!result.ok) error = result.message;
          return result;
        })
        .finally(() => {
          inFlight = null;
          signingOut = false;
          notify();
        });
      inFlight = settled;
      return settled;
    },
  };
}

export type SignOutController = ReturnType<typeof createSignOutController>;

/**
 * Publishes one controller through the auth context so every signed-in surface
 * (the header account menu and the account-page fallback, both mounted on
 * /account) shares the same in-flight guard, pending state and error.
 */
export function useSignOutController(request: () => Promise<SignOutResult>): SignOutController {
  // `request` is expected to be stable (a provider callback), so the controller
  // is created once and reused for the life of the auth context.
  return useMemo(() => createSignOutController(request), [request]);
}

/** Reads the shared sign-out state and exposes a fire-and-forget trigger. */
export const AuthContext = createContext<AuthState & { signOutController: SignOutController }>({
  loading: false,
  session: null,
  error: null,
  signIn: async () => {},
  signOut: async () => ({ ok: true }),
  signOutController: createSignOutController(async () => ({ ok: true })),
  // A new sign-in lifetime starts here. The same customer can sign in again
  // later, so the customer id alone cannot identify a lifetime.
  sessionGeneration: 0,
});
export const useAuth = () => useContext(AuthContext);
