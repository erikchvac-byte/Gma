import type { Dispensary } from '../types'

// The three chip filters map to the real Deal.type field (ADR-030 has no
// product-category field). 'all' is the default and a pure passthrough.
export type DealTypeSelection = 'all' | 'happy_hour' | 'daily'

// Discount magnitude is encoded with the single amber discount accent (ADR-041)
// at a stepped font-weight — these tiers drive that, never a second hue.
export type DiscountTier = 'high' | 'mid' | 'low'

// In-memory filter mirroring DealFeed's distance filter — zero network.
// Returns each store with its deals narrowed to the selection; empty stores
// drop out downstream when groupDealsByStore yields no group for them.
export function filterByType(dispensaries: Dispensary[], sel: DealTypeSelection): Dispensary[] {
  if (sel === 'all') return dispensaries
  return dispensaries.map((dispensary) => ({
    ...dispensary,
    deals: dispensary.deals.filter((deal) => deal.type === sel),
  }))
}

// One store-level urgency badge (ADR-009: reports time, never a verdict).
// Deals arrive pre-sorted soonest-first, so the first with a live countdown is
// the most urgent. No live countdown → the store is daily/all-day → "active today".
export function storeUrgencyBadge(
  deals: ReadonlyArray<{ countdown: string | null }>,
): { variant: 'urgent' | 'neutral'; text: string } {
  const live = deals.find((deal) => deal.countdown !== null)
  return live
    ? { variant: 'urgent', text: `ends in ${live.countdown}` }
    : { variant: 'neutral', text: 'active today' }
}

// Magnitude bucket for the discount figure. null / non-finite / non-positive
// (not parseable, or out-of-contract data reaching the client boundary
// unvalidated) → no figure renders at all, never "NaN%" or "-5%".
export function discountTier(pct: number | null): DiscountTier | null {
  if (pct === null || !Number.isFinite(pct) || pct <= 0) return null
  if (pct >= 30) return 'high'
  if (pct >= 15) return 'mid'
  return 'low'
}
