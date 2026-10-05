import { Link } from "react-router-dom";
import type { FormEvent } from "react";
import type { Profile } from "./profile";

import { accountInitials } from "./accountInitials";

const fields = {
  full_name: { label: "Full name", autoComplete: "section-profile name" },
  phone: { label: "Contact phone", autoComplete: "section-profile tel" },
  default_street_address: { label: "Street address / landmark", autoComplete: "section-delivery address-line1" },
  default_area: { label: "Area / community", autoComplete: "section-delivery address-level3" },
  default_city: { label: "City / town", autoComplete: "section-delivery address-level2" },
} satisfies Record<keyof Profile, { label: string; autoComplete: string }>;

type Props = {
  profile: Profile; savedName: string; email: string | undefined;
  ready: boolean; busy: boolean; status: string; error: string | null;
  onChange: (key: keyof Profile, value: string) => void;
  onSave: (event: FormEvent) => void;
  onSignOut: () => void;
};

export function AccountExperience({ profile, savedName, email, ready, busy, status, error, onChange, onSave, onSignOut }: Props) {
  const name = savedName.trim() || "Your account";
  function field(key: keyof Profile) {
    return <div key={key}><label htmlFor={key}>{fields[key].label}</label><input id={key} name={key} autoComplete={fields[key].autoComplete} type={key === "phone" ? "tel" : "text"} maxLength={200} disabled={!ready || busy} value={profile[key]} onChange={event => onChange(key, event.target.value)} /></div>;
  }
  return <section className="wrap page-section account-page motion-enter">
    <header className="account-heading"><p className="eyebrow">MY ACCOUNT</p><h1>Your account.</h1><div className="account-summary"><span className="account-avatar" aria-hidden="true">{accountInitials(savedName)}</span><div><p className="account-name">{name}</p><p className="account-email">{email}</p><p className="small-note">Signed in with Google</p></div></div></header>
    <div className="account-layout">
      <form className="profile-surface" onSubmit={onSave} aria-label="Profile and delivery details">
        <p className="small-note">Save your contact and delivery defaults together. You can change them for each order at checkout.</p>
        <fieldset className="account-fieldset"><legend>Profile</legend><div className="form-grid">{field("full_name")}{field("phone")}</div></fieldset>
        <fieldset className="account-fieldset"><legend>Delivery Details</legend><div className="form-grid">{field("default_street_address")}{field("default_area")}{field("default_city")}</div></fieldset>
        <div className="profile-actions"><button className="button" disabled={busy || !ready}>{busy ? "Saving…" : "Save profile & delivery details"}</button><p className="feedback" role="status">{status}</p></div>
      </form>
      <aside className="account-aside"><section className="account-note" aria-labelledby="account-orders"><h2 id="account-orders">Orders</h2><p>Revisit your orders, their delivery details and payment status.</p><Link className="text-link" to="/account/orders">My Orders →</Link></section>
        <section className="account-note account-session" aria-labelledby="account-security"><h2 id="account-security">Account & Security</h2><p>Signed in with Google</p><p className="account-email">{email}</p><p>You sign in with Google. Lumé House does not manage a password for this account.</p><button className="text-link" onClick={onSignOut}>Sign Out</button><p className="feedback" role="alert">{error}</p><Link className="text-link" to="/">Continue shopping →</Link></section>
      </aside>
    </div>
  </section>;
}
