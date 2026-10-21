import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

/**
 * Signed-in account menu.
 *
 * The header keeps a single interactive account control. For guests that stays
 * the existing plain "Account" link; for signed-in customers it becomes a
 * disclosure trigger that opens a compact menu of account destinations.
 *
 * Accessibility contract:
 * - trigger is a button with aria-haspopup="menu" and aria-expanded
 * - Enter/Space activate natively; ArrowDown moves into the menu
 * - ArrowUp/ArrowDown move between items, Home/End jump to the boundaries
 * - Escape closes and returns focus to the trigger
 * - an outside pointer press closes without stealing focus
 * - a route change closes the menu
 *
 * No email, full name or other identity detail is rendered here.
 */
type MenuDestination = { label: string; to: string };

const destinations: readonly MenuDestination[] = [
  { label: "My profile", to: "/account" },
  { label: "My orders", to: "/account/orders" },
];

export function AccountMenu({
  initials,
  onSignOut,
  signingOut,
  error,
}: {
  initials: string;
  onSignOut: () => void;
  signingOut: boolean;
  error: string | null;
}) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [openedFor, setOpenedFor] = useState(pathname);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const menuId = `${useId()}-account-menu`;

  // A route change closes the menu so it never lingers across navigation.
  // Adjusting during render (rather than in an effect) avoids a cascading commit.
  if (open && openedFor !== pathname) {
    setOpen(false);
    setOpenedFor(pathname);
  }

  // Outside pointer presses close the menu. Pointerdown (not click) so the menu
  // closes before a resulting navigation commits.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (container.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // When the menu opens, move focus to the first item.
  useEffect(() => {
    if (open) items.current[0]?.focus();
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const entries = items.current.filter((node): node is HTMLElement => Boolean(node));
    if (!entries.length) return;
    const index = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key === "Home") { event.preventDefault(); entries[0].focus(); return; }
    if (event.key === "End") { event.preventDefault(); entries[entries.length - 1].focus(); return; }
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = index === -1 ? 0 : (index + step + entries.length) % entries.length;
    entries[next].focus();
  }

  return (
    <div className="account-menu" ref={container}>
      <button
        type="button"
        ref={trigger}
        className="header-account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Account, signed in"
        onClick={() => setOpen(value => !value)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="account-badge" aria-hidden="true">{initials}</span>
      </button>
      {open && (
        <div className="account-menu-popover" id={menuId} role="menu" aria-label="Account" onKeyDown={onMenuKeyDown}>
          {destinations.map(({ label, to }, position) => (
            <Link
              key={to}
              role="menuitem"
              ref={node => { items.current[position] = node; }}
              to={to}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            ref={node => { items.current[destinations.length] = node; }}
            className="account-menu-signout"
            disabled={signingOut}
            aria-busy={signingOut}
            onClick={onSignOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
      {error && <p className="account-menu-error" role="alert">{error}</p>}
    </div>
  );
}
