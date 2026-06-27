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
// ADR-043: distanceMiles and address are optional enrichment, NOT visibility
// gates. distanceMiles is the one exception that still drops a record when it is
// PRESENT yet bad (NaN/Infinity/negative): it feeds `.toFixed(1)` / the radius
// filter / the sort comparator, so a poisoned number must never reach them.
// `address` has no such math or crash path — DealCard guards it with `typeof` +
// `.trim()` — so a bad address (empty/whitespace/non-string) NEVER drops the
// store; the card simply omits the address line and the store's deals still show.
//
// `lat`/`lng` (ADR-044) now have a consumer: `applyUserDistance` feeds them to
// the haversine/road-distance math. Like `address` they are ADR-043 deals-first
// enrichment, so a poisoned coord (NaN/Infinity/non-number) must NOT cost the
// store its deals — it is STRIPPED here (deleted, leaving the store coordless),
// not used to drop the record. The transform's finite-guard is the second line
// of defense; stripping keeps the contract clean (`lat`/`lng` are always finite
// or absent downstream). A coord is kept only when BOTH lat and lng are finite.
export function normalizeDispensaries(raw: unknown[]): Dispensary[] {
  const kept = raw.filter((item): item is Dispensary => {
    if (item === null || typeof item !== 'object') return false
    const { id, distanceMiles, deals } = item as Record<string, unknown>
    if (typeof id !== 'string' || id === '') return false
    if (!Array.isArray(deals)) return false
    if (distanceMiles === undefined) return true
    return typeof distanceMiles === 'number' && Number.isFinite(distanceMiles) && distanceMiles >= 0
  })
  // strip non-finite coords in place (the record is already kept) so a partial
  // or poisoned pair never reaches the distance math; an absent coord stays absent
  return kept.map((store) => {
    const latOk = typeof store.lat === 'number' && Number.isFinite(store.lat)
    const lngOk = typeof store.lng === 'number' && Number.isFinite(store.lng)
    if (latOk && lngOk) return store
    const next = { ...store }
    delete next.lat
    delete next.lng
    return next
  })
}
