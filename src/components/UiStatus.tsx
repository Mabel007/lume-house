import type { ReactNode } from 'react';

export function UiStatus({ kind, children, action }: { kind: 'loading' | 'empty' | 'error'; children: ReactNode; action?: ReactNode }) {
  return <div className={`ui-status ui-status-${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'}>
    {kind === 'loading' && <div className="ui-skeleton" aria-hidden="true"><span /><span /><span /></div>}
    <div className="ui-status-copy">{children}</div>
    {action && <div className="ui-status-action">{action}</div>}
  </div>;
}
