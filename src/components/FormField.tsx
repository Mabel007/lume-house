import { useState, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; wide?: boolean; hint?: string; error?: string };

export function FormField({ label, wide = false, hint, error: providedError, id, name, required, onInvalid, onInput, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...input }: Props) {
 const [nativeError, setNativeError] = useState('');
 const error = providedError ?? nativeError;
 const fieldId = id || name;
 const hintId = hint ? `${fieldId}-help` : undefined;
 const errorId = `${fieldId}-error`;
 return <div className={wide ? 'sm:col-span-2' : undefined}><label htmlFor={fieldId}>{label}{required && <span aria-hidden="true"> *</span>}</label><input {...input} id={fieldId} name={name} required={required} aria-invalid={error ? true : ariaInvalid} aria-describedby={[describedBy, hintId, error ? errorId : undefined].filter(Boolean).join(' ') || undefined} onInvalid={event => { setNativeError(event.currentTarget.validationMessage); onInvalid?.(event); }} onInput={event => { if (event.currentTarget.validity.valid) setNativeError(''); onInput?.(event); }}/>{hint && <p id={hintId} className="small-note">{hint}</p>}{error && <p id={errorId} className="field-error">{error}</p>}</div>;
}
