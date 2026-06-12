import React from 'react';

/**
 * Select — native select with brand chrome. Used for the optional
 * precision mode (year / make / model). Pass `options` as
 * [{value,label}] or use children for full control.
 */
export function Select({
  label,
  options,
  placeholder,
  id,
  className = '',
  children,
  ...rest
}) {
  const autoId = React.useId();
  const selectId = id || autoId;

  const field = (
    <select id={selectId} className="gma-select" {...rest}>
      {placeholder && <option value="">{placeholder}</option>}
      {options
        ? options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))
        : children}
    </select>
  );

  if (!label) return <div className={className}>{field}</div>;

  return (
    <div className={['gma-field', className].filter(Boolean).join(' ')}>
      <label className="gma-field__label" htmlFor={selectId}>
        {label}
      </label>
      {field}
    </div>
  );
}
