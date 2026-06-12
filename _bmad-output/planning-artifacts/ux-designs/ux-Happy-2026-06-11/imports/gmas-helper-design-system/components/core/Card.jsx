import React from 'react';

/**
 * Card — the brand's core surface: a hairline border on white.
 * Flat by default (no drop shadow); `interactive` adds a quiet
 * hover lift, `urgent` tints it amber for time-sensitive content.
 */
export function Card({
  children,
  padding = 'default',
  interactive = false,
  urgent = false,
  as = 'div',
  className = '',
  ...rest
}) {
  const Tag = as;
  const classes = [
    'gma-card',
    padding === 'flush' ? 'gma-card--flush' : '',
    padding === 'roomy' ? 'gma-card--roomy' : '',
    interactive ? 'gma-card--interactive' : '',
    urgent ? 'gma-card--urgent' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
