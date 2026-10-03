import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone, validatePaymentPhone } from "../checkout/payment.ts";
export type Profile = { full_name: string; phone: string; default_street_address: string; default_area: string; default_city: string };
export const emptyProfile: Profile = { full_name: "", phone: "", default_street_address: "", default_area: "", default_city: "" };
export function mapProfile(row: unknown): Profile {
  if (!row || typeof row !== "object") return { ...emptyProfile };
  const values = row as Record<string, unknown>;
  return Object.fromEntries(Object.keys(emptyProfile).map(key => [key, typeof values[key] === "string" ? values[key] : ""])) as Profile;
}
export function profileValues(profile: Profile) {
  const result = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, value.trim() || null]));
  if (Object.values(result).some(value => value && value.length > 200)) throw new Error("Please keep each field within 200 characters.");
  if (profile.phone.trim()) {
    if (validatePaymentPhone(profile.phone)) throw new Error("Enter a Sierra Leone phone number, for example +23276521208.");
    result.phone = normalizePhone(profile.phone);
  }
  return result;
}
export async function loadProfile(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("profiles").select("full_name,phone,default_street_address,default_area,default_city").eq("id", userId).maybeSingle();
  if (error) throw new Error("Your profile could not be loaded.");
  return data ? mapProfile(data) : null;
}
export async function saveProfile(client: SupabaseClient, userId: string, profile: Profile) {
  const values = profileValues(profile);
  const existing = await loadProfile(client, userId);
  if (!existing) {
    const { error } = await client.from("profiles").insert({ id: userId, ...values });
    if (!error) return;
    if (error.code !== "23505") throw new Error("Your profile could not be saved.");
  }
  const { error } = await client.from("profiles").update(values).eq("id", userId);
  if (error) throw new Error("Your profile could not be saved.");
}
