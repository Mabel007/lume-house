import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./config";

let client: SupabaseClient | undefined;
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const config = readSupabaseConfig(
      {
        VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env
          .VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      import.meta.env.DEV,
    );
    client = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}
