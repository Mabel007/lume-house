import { Link } from "react-router-dom";
import { useEffect, useRef, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import type { Profile } from "./profile";

import { AccountNavigation } from "./AccountNavigation";
import { PageHeader } from "../../components/PageHeader";
import "./account.css";

const fields = {
  full_name: { label: "Full name", autoComplete: "section-profile name" },
  phone: { label: "Contact phone", autoComplete: "section-profile tel" },
  default_street_address: { label: "Street address / landmark", autoComplete: "section-delivery address-line1" },
  default_area: { label: "Area / community", autoComplete: "section-delivery address-level3" },
  default_city: { label: "City / town", autoComplete: "section-delivery address-level2" },
} satisfies Record<keyof Profile, { label: string; autoComplete: string }>;

type Props = {
  profile: Profile; savedName: string; email: string | undefined; authenticatedName?: string;
  ready: boolean; busy: boolean; status: string; profileError: string | null; error: string | null;
  onChange: (key: keyof Profile, value: string) => void;
  onSave: (event: FormEvent) => void;
  onCancel: () => void;
  signOut: { signingOut: boolean; error: string | null; signOut: () => Promise<void> };
};

export function AccountExperience({ profile, email, ready, busy, status, profileError, error, onChange, onSave, onCancel, signOut }: Props) {
  const section = useRef<HTMLElement>(null);
  const { hash, key: locationKey } = useLocation();
  useEffect(() => {
    const target = hash.slice(1);
    if (!["personal-information", "delivery-details", "account-security", "account-help"].includes(target)) return;
    const frame = requestAnimationFrame(() => {
      const heading = section.current?.querySelector<HTMLElement>(`#${target}`);
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: "instant", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, locationKey]);

  function field(key: keyof Profile) {
    return <div key={key}><label htmlFor={key}>{fields[key].label}</label><input id={key} name={key} autoComplete={fields[key].autoComplete} type={key === "phone" ? "tel" : "text"} maxLength={200} disabled={!ready || busy} value={profile[key]} onChange={event => onChange(key, event.target.value)} /></div>;
  }
  return <section ref={section} className="wrap page-section account-page motion-enter">
    <PageHeader title="Your account." trail={[{ label: 'Shop', to: '/' }]} />
    <AccountNavigation />
    <div className="account-layout">
      <form className="profile-surface" onSubmit={onSave} aria-label="Profile and delivery details" aria-describedby="account-defaults-note">
        <p id="account-defaults-note" className="small-note">Save your contact and delivery defaults together. You can change them for each order at checkout. Cancel restores your last loaded or saved details.</p>
        <fieldset className="account-fieldset"><legend id="personal-information" tabIndex={-1}>Personal Information</legend><div className="form-grid">{field("full_name")}{field("phone")}<div className="account-email-field"><label htmlFor="account-auth-email">Email address</label><input id="account-auth-email" type="email" autoComplete="off" value={email ?? ""} readOnly aria-describedby="account-email-note"/><p id="account-email-note" className="small-note">Your email comes from the Google account you use to sign in.</p></div></div></fieldset>
        <fieldset className="account-fieldset"><legend id="delivery-details" tabIndex={-1}>Delivery Details</legend><p className="small-note">These are delivery defaults. Choose a supported Freetown delivery area or free Lumley pickup at checkout.</p><div className="form-grid">{field("default_street_address")}{field("default_area")}{field("default_city")}</div></fieldset>
        <div className="profile-actions"><button className="button" disabled={busy || !ready}>{busy ? "Saving…" : "Save profile & delivery details"}</button><button className="account-cancel" type="button" disabled={busy || !ready} onClick={onCancel}>Cancel</button><p className="feedback" role="status">{status}</p>{profileError ? <p className="feedback" role="alert">{profileError}</p> : null}</div>
      </form>
      <aside className="account-aside"><section className="account-note" aria-labelledby="account-orders"><h2 id="account-orders">Orders</h2><p>Revisit your orders, their delivery details and payment status.</p><Link className="text-link" to="/account/orders">My Orders →</Link></section>
        <section className="account-note account-session" aria-labelledby="account-security"><h2 id="account-security" tabIndex={-1}>Account & Security</h2><p>Signed in with Google</p><p className="account-email">{email}</p><p>You sign in with Google. Lumé House does not manage a password for this account.</p><button className="text-link" type="button" disabled={busy || signOut.signingOut} onClick={() => void signOut.signOut()}>{signOut.signingOut ? "Signing out…" : "Sign Out"}</button><p className="feedback" role="alert">{signOut.error || error}</p><Link className="text-link" to="/">Continue shopping →</Link></section>
        <section className="account-note account-help" aria-labelledby="account-help"><h2 id="account-help" tabIndex={-1}>Help & Support</h2><p>Find guidance for your account, delivery or a question about your order.</p><ul><li><Link className="text-link" to="/help#contact">Help & Contact →</Link></li><li><Link className="text-link" to="/help/delivery-pickup">Delivery & Pickup →</Link></li><li><Link className="text-link" to="/help/returns-refunds">Returns & Refunds →</Link></li></ul></section>
      </aside>
    </div>
  </section>;
}