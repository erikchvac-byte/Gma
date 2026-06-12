import React from 'react';

/**
 * IconButton — a square, label-free control for icon-only actions
 * (the settings gear, a close X, chevrons). Always pass `aria-label`.
 */
export function IconButton({
  children,
  size = 'md',
  outlined = false,
  type = 'button',
  className = '',
  ...rest
}) {
  const classes = [
    'gma-iconbtn',
    size === 'sm' ? 'gma-iconbtn--sm' : '',
    outlined ? 'gma-iconbtn--outlined' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
