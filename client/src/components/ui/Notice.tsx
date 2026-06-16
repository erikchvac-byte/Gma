import React from 'react'

export interface NoticeProps extends React.HTMLAttributes<HTMLParagraphElement> {
  variant?: 'default' | 'muted' | 'error' | 'urgent'
  icon?: React.ReactNode
  children?: React.ReactNode
}

export function Notice({
  children,
  variant = 'default',
  icon = null,
  role,
  className = '',
  ...rest
}: NoticeProps) {
  const classes = ['gma-notice', `gma-notice--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <p className={classes} role={role} {...rest}>
      {icon && <span className="gma-notice__icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </p>
  )
}
