import React from 'react';

/**
 * Skeleton — a pulsing placeholder block. The deal feed shows three
 * 64px-tall skeletons while loading; compose your own with `width`,
 * `height`, and `radius`.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  className = '',
  style,
  ...rest
}) {
  const px = (v) => (typeof v === 'number' ? `${v}px` : v);
  return (
    <div
      className={['gma-skeleton', className].filter(Boolean).join(' ')}
      style={{
        width: px(width),
        height: px(height),
        ...(radius != null ? { borderRadius: px(radius) } : null),
        ...style,
      }}
      aria-hidden="true"
      {...rest}
    />
  );
}

/**
 * SkeletonFeed — the exact loading state of the deal feed: N stacked
 * card-height skeletons inside a status region.
 */
export function SkeletonFeed({ rows = 3 }) {
  return (
    <div role="status" aria-label="Loading deals" style={{ display: 'grid', gap: 'var(--gap-feed)' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={64} />
      ))}
    </div>
  );
}
