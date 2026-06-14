import type { Dispensary } from '../types'

// Single validation home for the `useDeals` fetch boundary. A 200 response can
// carry a malformed `dispensaries` array (scraper-/seed-fed `data.json`), but
// render assumes every element is a well-formed object: DealFeed reads
// `.stale` first, DealCard calls `distanceMiles.toFixed(1)`, the distance
// filter compares `distanceMiles`, and DealFeed calls `deals.filter`.
//
// Per the data-hardening spec a record that fails any crash-path rule is
// DROPPED whole (not repaired) — distanceMiles is seed-sourced, so a bad value
// signals a corrupt record. Kept only when ALL hold:
//   - element is a non-null object
//   - distanceMiles is a finite number >= 0
//   - deals is an array
export function normalizeDispensaries(raw: unknown[]): Dispensary[] {
  return raw.filter((item): item is Dispensary => {
    if (item === null || typeof item !== 'object') return false
    const { distanceMiles, deals } = item as Record<string, unknown>
    if (typeof distanceMiles !== 'number' || !Number.isFinite(distanceMiles) || distanceMiles < 0) {
      return false
    }
    return Array.isArray(deals)
  })
}
