import React from 'react';

/**
 * Button — the primary action affordance for Gma's Helper.
 * Primary is the single confident green "go" button (the one the
 * age gate and settings sheet use). Secondary/ghost stay quiet so
 * the green never has to compete.
 */
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
}) {
  const classes = [
    'gma-btn',
    `gma-btn--${variant}`,
    size === 'sm' ? 'gma-btn--sm' : '',
    block ? 'gma-btn--block' : '',
    className,
  ].filter(Boolean).join(' ');

  const content = (
    <>
      {iconLeft}
      {children != null && <span>{children}</span>}
      {iconRight}
    </>
  );

  if (href && !disabled) {
    return (
      <a href={href} className={classes} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled} {...rest}>
      {content}
    </button>
  );
}
