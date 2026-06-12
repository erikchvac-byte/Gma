import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** `default` (12px), `flush` (none), or `roomy` (20px). */
  padding?: 'default' | 'flush' | 'roomy';
  /** Quiet border-darken + shadow on hover, for clickable cards. */
  interactive?: boolean;
  /** Amber tint for time-sensitive / happy-hour content. */
  urgent?: boolean;
  /** Element/tag to render as (e.g. 'article', 'li', 'a'). */
  as?: keyof JSX.IntrinsicElements;
  children?: React.ReactNode;
}

/**
 * The brand's core surface — a hairline border on white, flat by default.
 *
 * @startingPoint section="Core" subtitle="Hairline-on-white surface container" viewport="700x180"
 */
export function Card(props: CardProps): JSX.Element;
