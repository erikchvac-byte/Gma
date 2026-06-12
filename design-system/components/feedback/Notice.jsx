import React from 'react';

/**
 * Notice — an inline message line. `muted` is the non-intrusive
 * "N sources unavailable" / "Last updated" treatment (no box);
 * `error` and `urgent` get tinted containers. Pass `icon` for a
 * leading glyph.
 */
export function Notice({
  children,
  variant = 'default',
  icon = null,
  role,
  className = '',
  ...rest
}) {
  const classes = ['gma-notice', `gma-notice--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <p className={classes} role={role} {...rest}>
      {icon && <span className="gma-notice__icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </p>
  );
}
