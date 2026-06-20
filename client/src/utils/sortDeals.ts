import { hasValidTimedWindow, minutesUntilEnd } from './dealTime'
import type { Deal, Dispensary } from '../types'

export interface DealRow {
  dispensary: Dispensary
  deal: Deal
}

// Sort key tiers: [0] timed happy hours by minutes-until-end ascending,
// [1] all-day happy hours (null window), [2] daily deals by discountPct descending.
function sortKey(deal: Deal, now: Date): [number, number] {
  if (deal.type === 'happy_hour') {
    // only fully-valid timed windows compete in the urgency tier — degenerate
    // shapes (nulls, partial, malformed) sort with the all-day tier so display,
    // expiry, and sort routing can never disagree (see dealTime.hasValidTimedWindow)
    if (!hasValidTimedWindow(deal)) return [1, 0]
    return [0, minutesUntilEnd(deal.endTime as string, now)]
  }
  // null discount (not parseable from source text) sorts last among dailies
  return [2, -(deal.discountPct ?? 0)]
}

export function sortDeals(dispensaries: Dispensary[], now: Date): DealRow[] {
  const rows = dispensaries.flatMap((dispensary) =>
    dispensary.deals.map((deal) => ({ dispensary, deal })),
  )

  return rows.sort((a, b) => {
    const [tierA, valueA] = sortKey(a.deal, now)
    const [tierB, valueB] = sortKey(b.deal, now)
    return tierA !== tierB ? tierA - tierB : valueA - valueB
  })
}

export interface StoreGroup {
  dispensary: Dispensary
  deals: Deal[]
}

// One card per store: run the same global deal sort, then group rows by
// dispensary. A Map preserves first-appearance order, so within equal distances
// stores keep their best (highest-priority) deal order. The final stable sort by
// distanceMiles ascending makes the card list nearest-first, with best-deal order
// as the tie-break (Array.prototype.sort is stable). Each store's deals stay in
// sortDeals order. Reuses sortDeals wholesale — no duplicated tier logic.
// Assumes dispensary.id is unique per store (the data contract): two distinct
// stores sharing an id would merge into one card under the first one's name.
// distanceMiles is trusted as a finite number (same assumption as DealFeed's
// distance filter) — no extra guarding here.
export function groupDealsByStore(dispensaries: Dispensary[], now: Date): StoreGroup[] {
  const groups = new Map<string, StoreGroup>()
  for (const { dispensary, deal } of sortDeals(dispensaries, now)) {
    const group = groups.get(dispensary.id)
    if (group) group.deals.push(deal)
    else groups.set(dispensary.id, { dispensary, deals: [deal] })
  }
  return [...groups.values()].sort(
    (a, b) => a.dispensary.distanceMiles - b.dispensary.distanceMiles,
  )
}
