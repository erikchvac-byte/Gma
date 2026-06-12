import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * `neutral` (category), `fresh`/`stale` (source status, dotted),
   * `urgent` (amber happy-hour), `discount` (solid-green % chip).
   */
  variant?: 'neutral' | 'fresh' | 'stale' | 'urgent' | 'discount';
  /** Force the leading status dot (auto-on for fresh/stale). */
  dot?: boolean;
  children?: React.ReactNode;
}

/** Small uppercase status / category pill. */
export function Badge(props: BadgeProps): JSX.Element;
