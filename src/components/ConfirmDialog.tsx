import { useEffect, useId, useRef } from 'react';

export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onCancel }: { title: string; description: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId(), descriptionId = useId();
  useEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement;
    if (node?.showModal) node.showModal(); else node?.setAttribute('open', '');
    cancel.current?.focus();
    return () => { if (node?.open && node.close) node.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={dialog} className="ui-confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p>
    <div className="ui-dialog-actions"><button ref={cancel} type="button" className="button secondary" onClick={onCancel}>Cancel</button><button type="button" className="button destructive" onClick={onConfirm}>{confirmLabel}</button></div>
  </dialog>;
}
