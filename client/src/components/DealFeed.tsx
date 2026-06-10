import DealCard from './DealCard'
import { useDeals } from '../hooks/useDeals'
import { useNow } from '../hooks/useNow'
import { hasValidTimedWindow, isDealActive, minutesUntilEnd } from '../utils/dealTime'
import { sortDeals } from '../utils/sortDeals'
import { formatCountdown, formatLastUpdated, formatTimeOfDay } from '../utils/formatTime'
import type { Deal } from '../types'

// Window line per spec matrix: '9:00 PM – 11:30 PM' / '9:00 PM – close' /
// 'Active today'. Any present-but-unparseable time → no window text at all.
function windowText(deal: Deal): string | null {
  const { startTime, endTime } = deal
  if (startTime == null && endTime == null) return 'Active today'
  const start = startTime == null ? null : formatTimeOfDay(startTime)
  const end = endTime == null ? null : formatTimeOfDay(endTime)
  if (startTime != null && start === null) return null
  if (endTime != null && end === null) return null
  if (start !== null && end !== null) return `${start} – ${end}`
  if (start !== null) return `${start} – close`
  if (end !== null) return `Until ${end}`
  return null
}

// Countdown only for happy hours with a fully-valid timed window — the same
// predicate that drives expiry and sort tier, so the three never disagree
function countdownText(deal: Deal, now: Date): string | null {
  if (deal.type !== 'happy_hour' || !hasValidTimedWindow(deal)) return null
  return formatCountdown(minutesUntilEnd(deal.endTime as string, now))
}

export default function DealFeed() {
  const { data, isLoading, error } = useDeals()
  const now = useNow()

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading deals" className="px-4">
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-lg bg-gray-200" />
          <div className="h-16 rounded-lg bg-gray-200" />
          <div className="h-16 rounded-lg bg-gray-200" />
        </div>
      </div>
    )
  }

  if (error !== null || data === null) {
    return (
      <p role="alert" className="px-4 text-gray-700">
        Couldn&apos;t load deals. Please try again later.
      </p>
    )
  }

  // expiry filter runs BEFORE sortDeals so expired deals never reach the
  // comparator's overnight-wrap heuristic
  const activeDispensaries = data.dispensaries.map((dispensary) => ({
    ...dispensary,
    deals: dispensary.deals.filter((deal) => isDealActive(deal, now)),
  }))
  const rows = sortDeals(activeDispensaries, now)
  const lastUpdated = formatLastUpdated(data.meta.lastScraperRun)

  return (
    <section aria-label="Deal feed" className="px-4">
      {rows.length === 0 ? (
        <p aria-live="polite" className="text-gray-700">No active deals right now</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ dispensary, deal }) => (
            <li key={`${dispensary.id}|${deal.type}|${deal.description}|${deal.startTime ?? ''}|${deal.endTime ?? ''}`}>
              <DealCard
                dispensary={dispensary}
                deal={deal}
                windowText={windowText(deal)}
                countdown={countdownText(deal, now)}
              />
            </li>
          ))}
        </ul>
      )}
      {lastUpdated !== '' && (
        <footer className="mt-4 text-sm text-gray-500">Last updated {lastUpdated}</footer>
      )}
    </section>
  )
}
