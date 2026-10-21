type AccountIdentity = {
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

/**
 * Preserves the account-page precedence: profile name first (handled by the
 * caller), then Google's full_name, then name. Returns an empty string when no
 * usable metadata string exists so initials can fall back to LH.
 */
export function accountDisplayName(user: AccountIdentity): string {
  const value = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  return typeof value === "string" ? value : "";
}
