import React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'fresh' | 'stale' | 'urgent' | 'discount'
  dot?: boolean
  children?: React.ReactNode
}

export function Badge({
  children,
  variant = 'neutral',
  dot = false,
  className = '',
  ...rest
}: BadgeProps) {
  const showDot = dot || variant === 'fresh' || variant === 'stale'
  const classes = ['gma-badge', `gma-badge--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} {...rest}>
      {showDot && <span className="gma-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  )
}
