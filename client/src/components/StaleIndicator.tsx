interface StaleIndicatorProps {
  count: number
}

// Non-intrusive by design: one muted line, no icon, no action — it only
// informs that the feed may be incomplete (never inflate it with stale data)
export default function StaleIndicator({ count }: StaleIndicatorProps) {
  // integer guard also rejects NaN/fractional — "NaN sources unavailable"
  // must be unrenderable no matter what a future caller passes
  if (!Number.isInteger(count) || count <= 0) return null
  return (
    <p role="status" className="mt-1 text-sm text-gray-500">
      {count} {count === 1 ? 'source' : 'sources'} unavailable
    </p>
  )
}
