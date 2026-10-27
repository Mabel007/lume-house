import { useState, type ReactNode } from "react";

// Small, dependency-free disclosure for optional checkout guidance. Required
// hints stay visible on the page; secondary detail expands on demand. There is
// no animation, so reduced-motion preferences are always respected.
export function HelpDisclosure({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="help-disclosure">
      <button
        type="button"
        className="help-disclosure-trigger"
        aria-expanded={open}
        /* The panel is always mounted so the disclosure toggle can carry a
         * stable aria-controls reference in both states. `hidden` keeps the
         * collapsed content out of the accessibility tree and tab order. */
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((previous) => !previous)}
      >
        {label}
      </button>
      <div id={`${id}-panel`} className="help-disclosure-panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
