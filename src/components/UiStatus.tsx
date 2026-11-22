import type { ReactNode } from 'react';

export function UiStatus({ kind, children, action, className, announce = true }: { kind: 'loading' | 'empty' | 'error'; children: ReactNode; action?: ReactNode; className?: string; announce?: boolean }) {
  // A composed route can already have an owner for the same operation. In that case the
  // caller keeps the visible panel but drops the duplicate announcement.
  return <div className={className ? `ui-status ui-status-${kind} ${className}` : `ui-status ui-status-${kind}`} role={announce ? (kind === 'error' ? 'alert' : 'status') : undefined} aria-live={announce ? (kind === 'error' ? 'assertive' : 'polite') : undefined}>
    {kind === 'loading' && <div className="ui-skeleton" aria-hidden="true"><span /><span /><span /></div>}
    <div className="ui-status-copy">{children}</div>
    {action && <div className="ui-status-action">{action}</div>}
  </div>;
}
