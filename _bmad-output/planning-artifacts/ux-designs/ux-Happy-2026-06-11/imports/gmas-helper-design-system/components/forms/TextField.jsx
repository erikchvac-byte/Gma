import React from 'react';

/**
 * TextField — label + input + optional hint/error. Set `mono` for
 * numeric entry (vehicle MPG) so figures align with the rest of
 * the honest math.
 */
export function TextField({
  label,
  hint,
  error,
  mono = false,
  id,
  className = '',
  ...rest
}) {
  const autoId = React.useId();
  const inputId = id || autoId;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  const inputClasses = ['gma-input', mono ? 'gma-input--mono' : ''].filter(Boolean).join(' ');

  return (
    <div className={['gma-field', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="gma-field__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={inputClasses}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error ? (
        <span id={`${inputId}-err`} className="gma-field__error">{error}</span>
      ) : hint ? (
        <span id={`${inputId}-hint`} className="gma-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
