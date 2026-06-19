import DealCard from './DealCard'
import DistanceFilter, {
  DEFAULT_DISTANCE_MILES,
  MAX_DISTANCE_MILES,
  MIN_DISTANCE_MILES,
} from './DistanceFilter'
import { useDeals } from '../hooks/useDeals'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useNow } from '../hooks/useNow'
import { hasValidTimedWindow, isDealActive, minutesUntilEnd } from '../utils/dealTime'
import { sortDeals } from '../utils/sortDeals'
import { formatCountdown, formatLastUpdated, formatTimeOfDay } from '../utils/formatTime'
import { formatGasCost, isPositiveFinite, roundTripGasCost } from '../utils/gasCost'
import StaleIndicator from './StaleIndicator'
import { Notice, SkeletonFeed } from './ui'
import type { Deal, Dispensary } from '../types'

interface DealFeedProps {
  // resolved vehicle MPG from App (already validated); null → national average
  mpg?: number | null
}

const feedStyle = { padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-4)' } as const

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

export default function DealFeed({ mpg = null }: DealFeedProps) {
  const { data, isLoading, error } = useDeals()
  const now = useNow()
  const [storedDistance, setStoredDistance] = useLocalStorage<number>(
    'gma_distance_miles',
    DEFAULT_DISTANCE_MILES,
  )
  // same use-site validation pattern as MPG: stored value counts only as a
  // whole number of miles within the slider's range; anything else means 25
  const maxDistance =
    typeof storedDistance === 'number' &&
    Number.isInteger(storedDistance) &&
    storedDistance >= MIN_DISTANCE_MILES &&
    storedDistance <= MAX_DISTANCE_MILES
      ? storedDistance
      : DEFAULT_DISTANCE_MILES

  if (isLoading) {
    return (
      <div style={{ padding: 'var(--space-4)' }}>
        <SkeletonFeed rows={3} />
      </div>
    )
  }

  if (error !== null || data === null) {
    return (
      <div style={{ padding: 'var(--space-4)' }}>
        <Notice variant="error" role="alert">
          Couldn&apos;t load deals. Please try again later.
        </Notice>
      </div>
    )
  }

  // one strict predicate drives both omission and count so they can't
  // disagree (ADR-021 boolean precedent); count comes from the FULL API
  // array — deliberately independent of the distance filter below
  const isStale = (dispensary: Dispensary) => dispensary.stale === true
  const staleCount = data.dispensaries.filter(isStale).length
  const freshDispensaries = data.dispensaries.filter((dispensary) => !isStale(dispensary))
  // distance filter runs against the full in-memory array — no re-fetch;
  // inclusive boundary so a dispensary at exactly maxDistance stays visible
  const nearbyDispensaries = freshDispensaries.filter(
    (dispensary) => dispensary.distanceMiles <= maxDistance,
  )
  // expiry filter runs BEFORE sortDeals so expired deals never reach the
  // comparator's overnight-wrap heuristic
  const activeDispensaries = nearbyDispensaries.map((dispensary) => ({
    ...dispensary,
    deals: dispensary.deals.filter((deal) => isDealActive(deal, now)),
  }))
  const rows = sortDeals(activeDispensaries, now)
  const lastUpdated = formatLastUpdated(data.meta.lastScraperRun)

  // stored vehicle MPG wins only when it's a finite number > 0; anything else
  // (absent, null, garbage) silently falls back to nationalMpg
  const effectiveMpg =
    typeof mpg === 'number' && isPositiveFinite(mpg) ? mpg : data.meta.nationalMpg
  const gasCostText = (distanceMiles: number): string | null => {
    const cost = roundTripGasCost(distanceMiles, data.meta.gasPrice, effectiveMpg)
    return cost === null ? null : formatGasCost(cost)
  }

  return (
    <section aria-label="Deal feed" style={feedStyle}>
      <DistanceFilter value={maxDistance} onChange={setStoredDistance} />
      {rows.length === 0 ? (
        <Notice variant="muted" role="status" aria-live="polite">
          No active deals right now
        </Notice>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--gap-feed)' }}>
          {rows.map(({ dispensary, deal }, i) => (
            // index keeps the key unique even when sanitize blanks two same-window/same-type
            // deals' descriptions to '' (the only differentiating field would otherwise collide)
            <li key={`${dispensary.id}|${deal.type}|${deal.description}|${deal.startTime ?? ''}|${deal.endTime ?? ''}|${i}`}>
              <DealCard
                dispensary={dispensary}
                deal={deal}
                windowText={windowText(deal)}
                countdown={countdownText(deal, now)}
                gasCostText={gasCostText(dispensary.distanceMiles)}
              />
            </li>
          ))}
        </ul>
      )}
      {lastUpdated !== '' && (
        <Notice variant="muted" role="status">
          Last updated {lastUpdated}
        </Notice>
      )}
      <StaleIndicator count={staleCount} />
    </section>
  )
}
