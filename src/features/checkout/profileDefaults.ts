import type { Profile } from "../account/profile.ts";
export function checkoutDefaults(profile: Profile | null, email: string) {
  return { fullName: profile?.full_name || "", contactPhone: profile?.phone || "", address: profile?.default_street_address || "", area: profile?.default_area || "", city: profile?.default_city || "", email };
}
