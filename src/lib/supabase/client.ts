import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./config";

let client: SupabaseClient | undefined;
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const config = readSupabaseConfig({
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env
        .VITE_SUPABASE_PUBLISHABLE_KEY,
    });
    client = createClient(config.url, config.publishableKey, {
      // Phase 2 is public catalog only. Auth configuration belongs to a later phase.
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
