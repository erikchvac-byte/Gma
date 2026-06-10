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
  return [2, -deal.discountPct]
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
