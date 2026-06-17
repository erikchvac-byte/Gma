import { Notice } from './ui'

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
    <Notice variant="muted" role="status">
      {count} {count === 1 ? 'source' : 'sources'} unavailable
    </Notice>
  )
}
