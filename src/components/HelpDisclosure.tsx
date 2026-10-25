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
        /* Resolve only while the panel exists in the DOM: a collapsed control
         * must not point assistive-tech at a missing target (WAI-ARIA APG
         * disclosure pattern). */
        aria-controls={open ? `${id}-panel` : undefined}
        onClick={() => setOpen((previous) => !previous)}
      >
        {label}
      </button>
      {open && (
        <div id={`${id}-panel`} className="help-disclosure-panel">
          {children}
        </div>
      )}
    </div>
  );
}
