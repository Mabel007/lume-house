import { useState, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; wide?: boolean };

export function FormField({ label, wide = false, id, name, required, onInvalid, onInput, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...input }: Props) {
 const [error, setError] = useState('');
 const fieldId = id || name;
 const errorId = `${fieldId}-error`;
 return <div className={wide ? 'sm:col-span-2' : undefined}><label htmlFor={fieldId}>{label}{required && <span aria-hidden="true"> *</span>}</label><input {...input} id={fieldId} name={name} required={required} aria-invalid={error ? true : ariaInvalid} aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined} onInvalid={event => { setError(event.currentTarget.validationMessage); onInvalid?.(event); }} onInput={event => { if (event.currentTarget.validity.valid) setError(''); onInput?.(event); }}/>{error && <p id={errorId} className="field-error">{error}</p>}</div>;
}
