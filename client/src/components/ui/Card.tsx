import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  padding?: 'default' | 'flush' | 'roomy'
  interactive?: boolean
  urgent?: boolean
  as?: keyof React.JSX.IntrinsicElements
  children?: React.ReactNode
}

export function Card({
  children,
  padding = 'default',
  interactive = false,
  urgent = false,
  as = 'div',
  className = '',
  ...rest
}: CardProps) {
  const Tag = as as React.ElementType
  const classes = [
    'gma-card',
    padding === 'flush' ? 'gma-card--flush' : '',
    padding === 'roomy' ? 'gma-card--roomy' : '',
    interactive ? 'gma-card--interactive' : '',
    urgent ? 'gma-card--urgent' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  )
}
