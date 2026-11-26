import { useId, type InputHTMLAttributes } from 'react';

export function Field({ label, hint, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="rc-field">
      <label htmlFor={id} className="rc-field__label">{label}</label>
      <input id={id} className="rc-input" aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint && <p id={`${id}-hint`} className="rc-field__hint">{hint}</p>}
    </div>
  );
}
