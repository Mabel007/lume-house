import { useEffect, useState } from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getSupabaseClient } from "../../lib/supabase/client";
import { emptyProfile, loadProfile, saveProfile, type Profile } from "./profile";
export function AccountPage() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const [profile, setProfile] = useState<Profile>({ ...emptyProfile });
  const [status, setStatus] = useState("Loading profile…");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const id = auth.session?.user.id;
  useEffect(() => {
    let active = true;
    if (id) void loadProfile(getSupabaseClient(), id).then(value => { if (active) { setProfile(value || { ...emptyProfile }); setStatus(""); setReady(true); } }).catch(() => { if (active) setStatus("Your profile could not be loaded. Reload to try again."); });
    return () => { active = false; };
  }, [id]);
  if (auth.loading) return <section className="wrap page-section"><h1>Your account.</h1><p role="status">Restoring your session…</p></section>;
  if (!id) return <section className="wrap page-section sign-in-page motion-enter"><div className="sign-in-copy"><p className="eyebrow">YOUR LUMÉ HOUSE</p><h1>Welcome to<br/>Lumé House.</h1><p className="account-intro">A considered home begins with the pieces you love.</p><p>Sign in to save your profile and cart, and keep your orders in one place.</p><button className="button google-sign-in" onClick={() => void auth.signIn()}><span aria-hidden="true" className="google-mark">G</span>Sign in with Google</button><p className="small-note">Your profile defaults stay separate from each order’s delivery details.</p><p className="feedback" role="alert">{auth.error || (pathname === "/auth/callback" ? "Sign-in was not completed. Please try again." : "")}</p><Link className="text-link" to="/">Explore the collection →</Link></div><figure className="sign-in-image"><img src="/images/a-place-for-the-everyday.webp" alt="A warm living room with vases and candles on a wooden tray"/><figcaption>Beautiful things live here.</figcaption></figure></section>;
  if (pathname === "/auth/callback") return <Navigate to="/account" replace />;
  const labels: Record<keyof Profile, string> = { full_name: "Full name", phone: "Contact phone", default_street_address: "Default street address / landmark", default_area: "Default area / community", default_city: "Default city / town" };
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!id || !ready) return;
    setBusy(true);
    try { await saveProfile(getSupabaseClient(), id, profile); setStatus("Your profile has been saved."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Your profile could not be saved."); }
    finally { setBusy(false); }
  }
  return <section className="wrap page-section account-page motion-enter"><header className="account-heading"><p className="eyebrow">MY ACCOUNT</p><h1>Your profile.</h1><p className="account-intro">The details that make shopping feel effortless.</p><p className="account-email">{auth.session?.user.email}</p></header><div className="account-layout"><form className="profile-surface" onSubmit={event => void save(event)} aria-label="Customer profile"><div className="surface-heading"><span className="eyebrow">YOUR DETAILS</span><h2>A little about you.</h2><p className="small-note">Save your contact and delivery defaults. You can change them for each order at checkout.</p></div><div className="form-grid">{(Object.keys(labels) as (keyof Profile)[]).map(key => <div key={key}><label htmlFor={key}>{labels[key]}</label><input id={key} type={key === "phone" ? "tel" : "text"} maxLength={200} disabled={!ready || busy} value={profile[key]} onChange={event => setProfile({ ...profile, [key]: event.target.value })} /></div>)}</div><div className="profile-actions"><button className="button" disabled={busy || !ready}>{busy ? "Saving…" : "Save profile"}</button><p className="feedback" role="status">{status}</p></div></form><aside className="account-aside"><div className="account-note"><p className="eyebrow">YOUR SELECTED PIECES</p><h2>My orders</h2><p>Revisit your orders, their delivery details and payment status.</p><Link className="text-link" to="/account/orders">View my orders →</Link></div><div className="account-note account-session"><p className="eyebrow">LUMÉ HOUSE / FREETOWN</p><Link className="text-link" to="/">Continue shopping →</Link><button className="text-link" onClick={() => void auth.signOut()}>Sign out</button><p className="feedback" role="alert">{auth.error}</p></div></aside></div></section>;
}
