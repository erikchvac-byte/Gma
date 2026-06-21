import type { Dispensary } from '../types'

// Single validation home for the `useDeals` fetch boundary. A 200 response can
// carry a malformed `dispensaries` array (scraper-/seed-fed `data.json`), but
// render assumes every element is a well-formed object: DealFeed reads
// `.stale` first, DealCard calls `distanceMiles.toFixed(1)`, the distance
// filter compares `distanceMiles`, and DealFeed calls `deals.filter`.
//
// Per the data-hardening spec a record that fails any crash-path rule is
// DROPPED whole (not repaired). Kept only when ALL hold:
//   - element is a non-null object
//   - id is a non-empty string (the ingest/group/render key)
//   - deals is an array
//   - distanceMiles is ABSENT, or a finite number >= 0
//
// ADR-043: distanceMiles is optional enrichment, not a visibility gate — a
// push-ingested store with no distance must still render (no pill / no gas, per
// the consumers' finite-number guards). But a distance that is PRESENT yet bad
// (NaN/Infinity/negative) still signals a corrupt record and drops it, so the
// `.toFixed(1)` / filter / sort consumers never meet a poisoned number.
export function normalizeDispensaries(raw: unknown[]): Dispensary[] {
  return raw.filter((item): item is Dispensary => {
    if (item === null || typeof item !== 'object') return false
    const { id, distanceMiles, deals } = item as Record<string, unknown>
    if (typeof id !== 'string' || id === '') return false
    if (!Array.isArray(deals)) return false
    if (distanceMiles === undefined) return true
    return typeof distanceMiles === 'number' && Number.isFinite(distanceMiles) && distanceMiles >= 0
  })
}
