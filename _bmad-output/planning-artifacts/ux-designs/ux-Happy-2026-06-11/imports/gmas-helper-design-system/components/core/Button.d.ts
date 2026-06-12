import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. `primary` is the single green "go" action. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** `md` is the 44px touch target; `sm` is 36px for dense toolbars. */
  size?: 'md' | 'sm';
  /** Stretch to fill the container width (full-width mobile CTAs). */
  block?: boolean;
  /** Icon element rendered before the label. */
  iconLeft?: React.ReactNode;
  /** Icon element rendered after the label. */
  iconRight?: React.ReactNode;
  /** Render as an anchor instead of a button. */
  href?: string;
  children?: React.ReactNode;
}

/**
 * The primary action affordance.
 *
 * @startingPoint section="Core" subtitle="Primary, secondary, ghost & danger buttons" viewport="700x200"
 */
export function Button(props: ButtonProps): JSX.Element;
