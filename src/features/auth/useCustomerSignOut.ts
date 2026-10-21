import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext, createSignOutController, type CustomerSignOut } from "./AuthContext";

export type { CustomerSignOut };

/**
 * Shared customer sign-out view.
 *
 * Both the header account menu and the account-page fallback (both mounted on
 * /account) read this. It subscribes to the single sign-out controller held by
 * the auth context, so the two surfaces always agree about whether a sign-out is
 * pending, cannot both start one, and see the same retryable error. The success
 * path is driven solely by the provider's explicit result.
 */
const fallbackController = createSignOutController(async () => ({ ok: true }));

export function useCustomerSignOut(): CustomerSignOut {
  const context = useContext(AuthContext);
  const signOutController = context?.signOutController ?? fallbackController;
  const [, forceRender] = useState(0);
  useEffect(() => signOutController.subscribe(() => forceRender(value => value + 1)), [signOutController]);
  const signOut = useCallback(async () => { await signOutController.run(); }, [signOutController]);
  return { signingOut: signOutController.signingOut, error: signOutController.error, signOut };
}
