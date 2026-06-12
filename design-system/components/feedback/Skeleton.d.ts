import * as React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** CSS width — number is treated as px. */
  width?: number | string;
  /** CSS height — number is treated as px. */
  height?: number | string;
  /** Override the border radius. */
  radius?: number | string;
}

/** A single pulsing placeholder block. */
export function Skeleton(props: SkeletonProps): JSX.Element;

export interface SkeletonFeedProps {
  /** Number of card-height placeholder rows (default 3). */
  rows?: number;
}

/** The deal feed's exact loading state — stacked card-height skeletons. */
export function SkeletonFeed(props: SkeletonFeedProps): JSX.Element;
