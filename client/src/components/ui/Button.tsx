import React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  block?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  href?: string
  children?: React.ReactNode
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  iconLeft = null,
  iconRight = null,
  type = 'button',
  href,
  disabled = false,
  className = '',
  ...rest
}: ButtonProps) {
  const classes = [
    'gma-btn',
    `gma-btn--${variant}`,
    size === 'sm' ? 'gma-btn--sm' : '',
    block ? 'gma-btn--block' : '',
    className,
  ].filter(Boolean).join(' ')

  const content = (
    <>
      {iconLeft}
      {children != null && <span>{children}</span>}
      {iconRight}
    </>
  )

  if (href && !disabled) {
    return (
      <a href={href} className={classes} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {content}
      </a>
    )
  }

  return (
    <button type={type} className={classes} disabled={disabled} {...rest}>
      {content}
    </button>
  )
}
