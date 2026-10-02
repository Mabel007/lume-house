export type SupabaseConfig = { url: string; publishableKey: string };

export function readSupabaseConfig(env: {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}): SupabaseConfig {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  // Accept only the new public key format. Reject secret keys and legacy JWT keys.
  // This guard cannot hide a secret already embedded by Vite: configure safely first.
  if (
    !url ||
    !publishableKey?.startsWith("sb_publishable_") ||
    publishableKey.length <= "sb_publishable_".length
  ) {
    throw new Error("Supabase browser configuration is missing or invalid.");
  }
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    )
      throw new Error();
  } catch {
    throw new Error("Supabase project URL must be an HTTPS origin.");
  }
  return { url, publishableKey };
}
