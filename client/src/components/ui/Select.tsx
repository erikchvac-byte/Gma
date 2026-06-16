import React from 'react'

export type SelectOption = { value: string; label: string }

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode
  options?: SelectOption[]
  placeholder?: string
}

export function Select({
  label,
  options,
  placeholder,
  id,
  className = '',
  children,
  ...rest
}: SelectProps) {
  const autoId = React.useId()
  const selectId = id || autoId

  const field = (
    <select id={selectId} className="gma-select" {...rest}>
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options
        ? options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))
        : children}
    </select>
  )

  if (!label) return <div className={className}>{field}</div>

  return (
    <div className={['gma-field', className].filter(Boolean).join(' ')}>
      <label className="gma-field__label" htmlFor={selectId}>
        {label}
      </label>
      {field}
    </div>
  )
}
