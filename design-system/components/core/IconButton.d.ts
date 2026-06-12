import * as React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 44px (default) or 36px square. */
  size?: 'md' | 'sm';
  /** Add a neutral outline + white fill (for toolbar use on tinted surfaces). */
  outlined?: boolean;
  /** REQUIRED for accessibility — the icon has no visible label. */
  'aria-label': string;
  children?: React.ReactNode;
}

/** Square, label-free control for icon-only actions (gear, close, chevrons). */
export function IconButton(props: IconButtonProps): JSX.Element;
