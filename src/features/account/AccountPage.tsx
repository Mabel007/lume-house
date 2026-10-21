import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  // Every asynchronous profile operation belongs to the customer that started
  // it. The epoch changes with the signed-in customer, so a completion that
  // arrives after the session switched can never touch the new session. The
  // identity check alone is not enough: the same customer can sign out and in
  // again, and the account page stays mounted across that.
  const identity = useRef(id);
  const epoch = useRef(0);
  useLayoutEffect(() => {
    identity.current = id;
    epoch.current += 1;
    // The previous customer's profile, pending save and error never belong to
    // the customer who is signing in now. The reset is its own transition so
    // the new session starts from a clean, known state.
    const startSession = async () => {
      setProfile({ ...emptyProfile });
      setSavedProfile({ ...emptyProfile });
      setProfileError(null);
      setBusy(false);
      setReady(false);
      setStatus("Loading profile…");
    };
    void startSession();
  }, [id]);
  useEffect(() => {
    let active = true;
    const owner = id;
    const generation = epoch.current;
    const isCurrent = () => active && identity.current === owner && epoch.current === generation;
    if (id) void loadProfile(getSupabaseClient(), id).then(value => { if (!isCurrent()) return; const loaded = value || { ...emptyProfile }; setProfile(loaded); setSavedProfile({ ...loaded }); setStatus(""); setReady(true); }).catch(() => { if (isCurrent()) setStatus("Your profile could not be loaded. Reload to try again."); });
    return () => { active = false; };
  }, [id]);
  if (auth.loading) return <section className="wrap page-section"><h1>Your account.</h1><p role="status">Restoring your session…</p></section>;
  if (!id) return <section className="wrap page-section sign-in-page motion-enter"><div className="sign-in-copy"><p className="eyebrow">YOUR LUMÉ HOUSE</p><h1>Welcome to<br/>Lumé House.</h1><p className="account-intro">A considered home begins with the pieces you love.</p><p>Sign in to save your profile and Cart, and keep your orders in one place.</p><button className="button google-sign-in" onClick={() => void auth.signIn()}><span aria-hidden="true" className="google-mark">G</span>Sign in with Google</button><p className="small-note">Your profile defaults stay separate from each order’s delivery details.</p><p className="feedback" role="alert">{auth.error || (pathname === "/auth/callback" ? "Sign-in was not completed. Please try again." : "")}</p><Link className="text-link" to="/">Explore the collection →</Link></div><figure className="sign-in-image"><img src="/images/a-place-for-the-everyday.webp" alt="A warm living room with vases and candles on a wooden tray"/><figcaption>Beautiful things live here.</figcaption></figure></section>;
  if (pathname === "/auth/callback") return <Navigate to="/account" replace />;
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!id || !ready || busy) return;
    const owner = id;
    const generation = epoch.current;
    const submittedProfile = { ...profile };
    setBusy(true); setProfileError(null); setStatus("");
    try {
      // The write always targets the customer that started it.
      await saveProfile(getSupabaseClient(), owner, submittedProfile);
      // The session may have changed while the save was in flight. The result
      // then belongs to a session that no longer exists and must not touch the
      // new customer's form, baseline or notifications.
      if (identity.current !== owner || epoch.current !== generation) return;
      setSavedProfile(submittedProfile);
      // Only a confirmed save is announced, and the shared notification owns
      // the message so it is announced exactly once.
      notify({ tone: "success", message: "Your profile has been saved." });
    }
    catch (error) {
      if (identity.current !== owner || epoch.current !== generation) return;
      // The failure stays inline and assertive; it is never also announced.
      setProfileError(error instanceof Error ? error.message : "Your profile could not be saved.");
    }
    finally {
      // Only the operation that still owns the session may clear the pending
      // state of this session.
      if (identity.current === owner && epoch.current === generation) setBusy(false);
    }
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
