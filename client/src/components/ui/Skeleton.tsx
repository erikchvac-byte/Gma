import React from 'react'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number | string
  height?: number | string
  radius?: number | string
}

export interface SkeletonFeedProps {
  rows?: number
}

const px = (v: number | string | undefined): string | undefined => {
  if (v === undefined) return undefined
  return typeof v === 'number' ? `${v}px` : v
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  className = '',
  style,
  ...rest
}: SkeletonProps) {
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
  )
}

export function SkeletonFeed({ rows = 3 }: SkeletonFeedProps) {
  return (
    <div role="status" aria-label="Loading deals" style={{ display: 'grid', gap: 'var(--gap-feed)' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={64} />
      ))}
    </div>
  )
}
