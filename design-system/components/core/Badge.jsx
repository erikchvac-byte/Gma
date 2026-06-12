import React from 'react';

/**
 * Badge — a small status / category pill.
 * `fresh` and `stale` show a leading dot; `urgent` is the amber
 * happy-hour marker; `discount` is the solid-green percentage chip.
 */
export function Badge({
  children,
  variant = 'neutral',
  dot = false,
  className = '',
  ...rest
}) {
  const showDot = dot || variant === 'fresh' || variant === 'stale';
  const classes = ['gma-badge', `gma-badge--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {showDot && <span className="gma-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
