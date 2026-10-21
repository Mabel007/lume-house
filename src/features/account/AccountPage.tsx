import { useEffect, useState } from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getSupabaseClient } from "../../lib/supabase/client";
import { emptyProfile, loadProfile, saveProfile, type Profile } from "./profile";
import { AccountExperience } from "./AccountExperience";
import { accountDisplayName } from "./accountIdentity";
import { useCustomerSignOut } from "../auth/useCustomerSignOut";
import { useNotifications } from "../../components/notifications";
export function AccountPage() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const signOut = useCustomerSignOut();
  const { notify } = useNotifications();
  const [profile, setProfile] = useState<Profile>({ ...emptyProfile });
  const [status, setStatus] = useState("Loading profile…");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [savedProfile, setSavedProfile] = useState<Profile>({ ...emptyProfile });
  const id = auth.session?.user.id;
  useEffect(() => {
    let active = true;
    if (id) void loadProfile(getSupabaseClient(), id).then(value => { if (active) { const loaded = value || { ...emptyProfile }; setProfile(loaded); setSavedProfile({ ...loaded }); setStatus(""); setReady(true); } }).catch(() => { if (active) setStatus("Your profile could not be loaded. Reload to try again."); });
    return () => { active = false; };
  }, [id]);
  if (auth.loading) return <section className="wrap page-section"><h1>Your account.</h1><p role="status">Restoring your session…</p></section>;
  if (!id) return <section className="wrap page-section sign-in-page motion-enter"><div className="sign-in-copy"><p className="eyebrow">YOUR LUMÉ HOUSE</p><h1>Welcome to<br/>Lumé House.</h1><p className="account-intro">A considered home begins with the pieces you love.</p><p>Sign in to save your profile and Cart, and keep your orders in one place.</p><button className="button google-sign-in" onClick={() => void auth.signIn()}><span aria-hidden="true" className="google-mark">G</span>Sign in with Google</button><p className="small-note">Your profile defaults stay separate from each order’s delivery details.</p><p className="feedback" role="alert">{auth.error || (pathname === "/auth/callback" ? "Sign-in was not completed. Please try again." : "")}</p><Link className="text-link" to="/">Explore the collection →</Link></div><figure className="sign-in-image"><img src="/images/a-place-for-the-everyday.webp" alt="A warm living room with vases and candles on a wooden tray"/><figcaption>Beautiful things live here.</figcaption></figure></section>;
  if (pathname === "/auth/callback") return <Navigate to="/account" replace />;
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!id || !ready || busy) return;
    const submittedProfile = { ...profile };
    setBusy(true); setProfileError(null); setStatus("");
    try {
      await saveProfile(getSupabaseClient(), id, submittedProfile);
      setSavedProfile(submittedProfile);
      // Only a confirmed save is announced, and the shared notification owns
      // the message so it is announced exactly once.
      notify({ tone: "success", message: "Your profile has been saved." });
    }
    catch (error) {
      // The failure stays inline and assertive; it is never also announced.
      setProfileError(error instanceof Error ? error.message : "Your profile could not be saved.");
    }
    finally { setBusy(false); }
  }
  function cancel() {
    if (!ready || busy) return;
    setProfile({ ...savedProfile });
    setProfileError(null);
    setStatus("Unsaved changes discarded.");
  }
  const authenticatedName = accountDisplayName(auth.session?.user);
  return <AccountExperience profile={profile} savedName={savedProfile.full_name} authenticatedName={authenticatedName || undefined} email={auth.session?.user.email} ready={ready} busy={busy} status={status} profileError={profileError} error={auth.error} onChange={(key, value) => setProfile(previous => ({ ...previous, [key]: value }))} onSave={event => void save(event)} onCancel={cancel} signOut={signOut} />;
}
