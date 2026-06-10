import type { Deal, Dispensary } from '../types'

export interface DealCardProps {
  dispensary: Dispensary
  deal: Deal
  // computed upstream (DealFeed): null means "render nothing" — e.g. malformed times
  windowText: string | null
  countdown: string | null
}

// Purely presentational: receives data and computed values as props.
// No fetching, no intervals, no hooks.
export default function DealCard({ dispensary, deal, windowText, countdown }: DealCardProps) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{dispensary.name}</h2>
        <span className="text-sm text-gray-500">{dispensary.distanceMiles.toFixed(1)} miles</span>
      </div>
      <p className="text-gray-700">{deal.description}</p>
      <p className="font-medium">{deal.discountPct}% off</p>
      {windowText !== null && <p className="text-sm text-gray-500">{windowText}</p>}
      {countdown !== null && <p className="text-sm font-medium">{countdown} left</p>}
    </article>
  )
}
