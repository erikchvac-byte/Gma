import type { Deal, Dispensary } from '../types'

export interface DealRow {
  dispensary: Dispensary
  deal: Deal
}

const MINUTES_PER_DAY = 24 * 60

function minutesUntilEnd(endTime: string, now: Date): number {
  const [hours, minutes] = endTime.split(':').map(Number)
  const endMinutes = hours * 60 + minutes
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const diff = endMinutes - nowMinutes
  // overnight windows (e.g. 22:00-02:00) end "tomorrow" — wrap past midnight
  return diff < 0 ? diff + MINUTES_PER_DAY : diff
}

// Sort key tiers: [0] timed happy hours by minutes-until-end ascending,
// [1] all-day happy hours (null window), [2] daily deals by discountPct descending.
function sortKey(deal: Deal, now: Date): [number, number] {
  if (deal.type === 'happy_hour') {
    // == null also catches undefined (scraper data may omit the key entirely)
    if (deal.endTime == null) return [1, 0]
    const minutes = minutesUntilEnd(deal.endTime, now)
    // malformed time strings (e.g. "4pm") yield NaN — sort with the all-day tier
    // instead of poisoning the comparator
    return Number.isNaN(minutes) ? [1, 0] : [0, minutes]
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
