import React from 'react'

export interface RangeSliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label?: React.ReactNode
  value: number
  onChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
  valueText?: React.ReactNode
  showTicks?: boolean
  minLabel?: React.ReactNode
  maxLabel?: React.ReactNode
}

export function RangeSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  valueText,
  showTicks = false,
  minLabel,
  maxLabel,
  id,
  className = '',
  ...rest
}: RangeSliderProps) {
  const autoId = React.useId()
  const inputId = id || autoId
  const classes = ['gma-range', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <div className="gma-range__top">
        {label != null && (
          <label className="gma-range__label" htmlFor={inputId}>
            {label}
          </label>
        )}
        <span className="gma-range__value">{valueText != null ? valueText : value}</span>
      </div>
      <input
        id={inputId}
        className="gma-range__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={typeof valueText === 'string' ? valueText : undefined}
        onChange={(e) => onChange && onChange(Number(e.target.value))}
        {...rest}
      />
      {showTicks && (
        <div className="gma-range__ticks">
          <span>{minLabel != null ? minLabel : min}</span>
          <span>{maxLabel != null ? maxLabel : max}</span>
        </div>
      )}
    </div>
  )
}
