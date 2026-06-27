import type { Dispensary, UserLocation } from '../types'
import { roadDistanceMiles } from './distance'

// The single chokepoint that makes distance user-relative (CAP-2 / CAP-3).
// Runs once in DealFeed, right after the data arrives, BEFORE the radius filter,
// nearest-first sort, and card render — so every existing consumer keeps working
// untouched on a now-honest `distanceMiles`.
//
// It REPLACES `distanceMiles` unconditionally (never augments). This is what
// retires the fixed-origin distance (ADR-008/011): the 4 seed stores carry a
// stale fixed-origin `distanceMiles` in data.json, and a naive "add a distance
// when location exists" would leave that stale pill showing with no location
// set. Here:
//   - no location               → strip distanceMiles from every store
//   - location but store has no  → strip (Honest Math: never a faked distance)
//     finite coords
//   - location + finite coords   → distanceMiles = haversine × 1.3 road factor
// A computed value that comes back non-finite (defensive) is also stripped.
export function applyUserDistance(
  dispensaries: Dispensary[],
  location: UserLocation | null,
): Dispensary[] {
  return dispensaries.map((store) => {
    const next = { ...store }
    delete next.distanceMiles

    if (location === null) return next
    if (typeof store.lat !== 'number' || typeof store.lng !== 'number') return next

    const miles = roadDistanceMiles(location.lat, location.lng, store.lat, store.lng)
    if (!Number.isFinite(miles)) return next

    next.distanceMiles = miles
    return next
  })
}
