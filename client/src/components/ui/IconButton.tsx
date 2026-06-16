import React from 'react'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'md' | 'sm'
  outlined?: boolean
  'aria-label': string
  children?: React.ReactNode
}

export function IconButton({
  children,
  size = 'md',
  outlined = false,
  type = 'button',
  className = '',
  ...rest
}: IconButtonProps) {
  const classes = [
    'gma-iconbtn',
    size === 'sm' ? 'gma-iconbtn--sm' : '',
    outlined ? 'gma-iconbtn--outlined' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
