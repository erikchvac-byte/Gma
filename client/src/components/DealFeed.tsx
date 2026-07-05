import { useState } from 'react'
import DealCard from './DealCard'
import DealCategoryFilter from './DealCategoryFilter'
import DistanceFilter, {
  DEFAULT_DISTANCE_MILES,
  MAX_DISTANCE_MILES,
  MIN_DISTANCE_MILES,
} from './DistanceFilter'
import { useDeals } from '../hooks/useDeals'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useNow } from '../hooks/useNow'
import { hasValidTimedWindow, isDealActive, minutesUntilEnd } from '../utils/dealTime'
import { groupDealsByStore, byDistanceMiles, type StoreGroup } from '../utils/sortDeals'
import {
  areDealsExpired,
  buildDealBlocks,
  categoriesPresent,
  filterByCategory,
  type DealCategory,
} from '../utils/dealView'
import {
  ROTATING_ICON_NAMES,
  ROTATING_ICON_POOLS,
  buildIconSequence,
  mulberry32,
  type RotatingIconName,
  type RotatingIconSrcs,
} from '../utils/dealIconPools'
import { formatCountdown, formatLastUpdated, formatTimeOfDay } from '../utils/formatTime'
import { formatGasCost, isPositiveFinite, roundTripGasCost } from '../utils/gasCost'
import { applyUserDistance } from '../utils/withUserDistance'
import StaleIndicator from './StaleIndicator'
import { Notice, SkeletonFeed } from './ui'
import type { Deal, Dispensary, UserLocation } from '../types'

interface DealFeedProps {
  // resolved vehicle MPG from App (already validated); null → no gas line
  mpg?: number | null
  // resolved user location from App (already validated); null → no distance/gas
  // anywhere (CAP-2). Distances are computed user-relative from this (CAP-3).
  location?: UserLocation | null
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

export default function DealFeed({ mpg = null, location = null }: DealFeedProps) {
  const { data, isLoading, error } = useDeals()
  const now = useNow()
  const [storedDistance, setStoredDistance] = useLocalStorage<number>(
    'gma_distance_miles',
    DEFAULT_DISTANCE_MILES,
  )
  // icon-bar category filter — in-memory only (mirrors the distance filter),
  // not persisted; null is the default so the feed opens unfiltered
  const [selectedCategory, setSelectedCategory] = useState<DealCategory | null>(null)
  // one seed for the visit: the rotating icon pools (dealIconPools) must deal
  // the SAME images on every render — this feed re-renders each second via
  // useNow — while a fresh visit gets a fresh shuffle
  const [iconSeed] = useState(() => Math.floor(Math.random() * 0xffffffff))
  // same use-site validation pattern as MPG: stored value counts only as a
  // whole number of miles within the slider's range; anything else falls back
  // to DEFAULT_DISTANCE_MILES (50)
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

  // CAP-2/CAP-3: recompute every store's distance user-relative BEFORE the
  // radius filter, nearest-first sort, and render. With no location this strips
  // distanceMiles from every store (including the 4 seed stores' stale
  // fixed-origin value), so no pill or gas line shows anywhere — Honest Math,
  // retiring ADR-008/011. One chokepoint; downstream consumers are untouched.
  const located = applyUserDistance(data.dispensaries, location)
  // one strict predicate drives both omission and count so they can't
  // disagree (ADR-021 boolean precedent); count comes from the FULL API
  // array — deliberately independent of the distance filter below
  const isStale = (dispensary: Dispensary) => dispensary.stale === true
  const staleCount = located.filter(isStale).length
  const freshDispensaries = located.filter((dispensary) => !isStale(dispensary))
  // distance filter runs against the full in-memory array — no re-fetch;
  // inclusive boundary so a dispensary at exactly maxDistance stays visible.
  // ADR-043: a store with no distance is never dropped by the radius slider —
  // the filter only narrows stores that actually have a distance to compare.
  const nearbyDispensaries = freshDispensaries.filter(
    (dispensary) =>
      dispensary.distanceMiles === undefined || dispensary.distanceMiles <= maxDistance,
  )
  // CAP-1: store-level DISPLAY expiry (ADR-026 last-known-good time bound). A
  // non-stale store whose last non-empty ingest (lastFetchedAt) is older than
  // DEAL_EXPIRY_MS has almost certainly ended its promotion — treat its cached
  // deals as expired rather than active. Split here, AFTER the stale drop above,
  // so a `stale` store stays in the "sources unavailable" count and only
  // non-stale-but-time-expired stores become "No current deals" cards (CAP-2).
  const liveDispensaries = nearbyDispensaries.filter((d) => !areDealsExpired(d.lastFetchedAt, now))
  // per-deal time expiry runs BEFORE sortDeals so expired deals never reach the
  // comparator's overnight-wrap heuristic
  const activeDispensaries = liveDispensaries.map((dispensary) => ({
    ...dispensary,
    deals: dispensary.deals.filter((deal) => isDealActive(deal, now)),
  }))
  // The icon bar shows ONLY categories at least one on-page store carries, from
  // the pre-filter active set — so pressing an icon never removes the others.
  const presentCategories = categoriesPresent(activeDispensaries)
  // If the selected category left the page (its last deal expired, or the
  // radius slider dropped its last store), CLEAR the selection — a mere
  // derived mask would leave the state dormant and silently re-engage the
  // filter when the category returns. Render-phase adjustment (React's
  // "adjusting state when props change" pattern); the effective `category`
  // below keeps THIS render consistent before the cleared state lands.
  if (selectedCategory !== null && !presentCategories.includes(selectedCategory)) {
    setSelectedCategory(null)
  }
  const category =
    selectedCategory !== null && presentCategories.includes(selectedCategory)
      ? selectedCategory
      : null
  // An "expired" card only makes sense for a store that actually has cached deals
  // to suppress — a never-ingested/empty store has nothing to expire and stays
  // out of the feed exactly as before (guards the deriveStoreStatus 'failed' case
  // from surfacing as an empty card). Expired cards are also shown ONLY in the
  // unfiltered feed: a category icon narrows to ACTIVE deals of that category,
  // which an expired store has none of, so under any selection it drops. (A
  // selection can never empty the feed: its icon only renders while ≥1 active
  // deal matches, and the clear above removes it the moment that stops.)
  // [Ask-First decision D-chip: hide expired under a selection — Erik may revisit.]
  const expiredDispensaries =
    category === null
      ? nearbyDispensaries.filter((d) => areDealsExpired(d.lastFetchedAt, now) && d.deals.length > 0)
      : []
  // category filter runs in-memory after expiry, before grouping — a store with
  // no deals in the selected category yields no group and drops from the feed
  const typedDispensaries = filterByCategory(activeDispensaries, category)
  const liveGroups = groupDealsByStore(typedDispensaries, now)
  // CAP-2: expired stores are NOT dropped — they render in place with a "No
  // current deals" state (empty deals drives DealCard's expired branch). They
  // bypass groupDealsByStore (which discards zero-deal stores) and merge into the
  // same nearest-first distance order so an expired store keeps its position.
  const expiredGroups: StoreGroup[] = expiredDispensaries.map((dispensary) => ({
    dispensary,
    deals: [],
  }))
  const storeGroups = [...liveGroups, ...expiredGroups].sort(byDistanceMiles)
  const lastUpdated = formatLastUpdated(data.meta.lastScraperRun)

  // build each store's DealView list once — the same array drives both the
  // rotation counting below and the card render, so they can never disagree
  const storeViews = storeGroups.map(({ dispensary, deals }) => ({
    dispensary,
    views: deals.map((deal) => ({
      deal,
      windowText: windowText(deal),
      countdown: countdownText(deal, now),
    })),
  }))
  // Rotating sale-tag pools (dealIconPools): count each rotating family's glyph
  // occurrences per store in feed reading order, then deal every store its
  // slice of one feed-wide, seed-stable shuffled sequence — the no-repeat cycle
  // spans cards, and re-renders replay the identical assignment.
  const countsByStore = storeViews.map(({ views }) => {
    const counts: Partial<Record<RotatingIconName, number>> = {}
    for (const block of buildDealBlocks(views))
      for (const name of block.icons)
        if (name in ROTATING_ICON_POOLS) {
          const family = name as RotatingIconName
          counts[family] = (counts[family] ?? 0) + 1
        }
    return counts
  })
  const rotatingByStore: RotatingIconSrcs[] = countsByStore.map(() => ({}))
  ROTATING_ICON_NAMES.forEach((family, familyIndex) => {
    const total = countsByStore.reduce((sum, counts) => sum + (counts[family] ?? 0), 0)
    const sequence = buildIconSequence(
      ROTATING_ICON_POOLS[family],
      total,
      mulberry32(iconSeed + familyIndex),
    )
    let offset = 0
    countsByStore.forEach((counts, storeIndex) => {
      const n = counts[family] ?? 0
      rotatingByStore[storeIndex][family] = sequence.slice(offset, offset + n)
      offset += n
    })
  })

  // MPG now comes ONLY from the user's chosen vehicle — the hardcoded
  // national-average default (ADR-003/013) was removed. No vehicle selected →
  // null → no gas line (Honest Math: never a gas figure on a guessed MPG).
  const effectiveMpg = typeof mpg === 'number' && isPositiveFinite(mpg) ? mpg : null
  // Gas needs BOTH a distance (ADR-043: optional) AND a vehicle MPG; either
  // missing → null → no gas line. Distance still shows from distanceMiles alone.
  const gasCostText = (distanceMiles: number | undefined): string | null => {
    if (distanceMiles === undefined || effectiveMpg === null) return null
    const cost = roundTripGasCost(distanceMiles, data.meta.gasPrice, effectiveMpg)
    return cost === null ? null : formatGasCost(cost)
  }

  return (
    <section aria-label="Deal feed" style={feedStyle}>
      <DistanceFilter value={maxDistance} onChange={setStoredDistance} />
      <DealCategoryFilter
        categories={presentCategories}
        selected={category}
        onSelect={setSelectedCategory}
      />
      {storeGroups.length === 0 ? (
        <Notice variant="muted" role="status" aria-live="polite">
          No active deals right now
        </Notice>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--gap-feed)' }}>
          {storeViews.map(({ dispensary, views }, storeIndex) => (
            // one listitem per STORE; deals are grouped inside the card
            <li key={dispensary.id}>
              <DealCard
                dispensary={dispensary}
                deals={views}
                gasCostText={gasCostText(dispensary.distanceMiles)}
                rotatingIconSrcs={rotatingByStore[storeIndex]}
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
